"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/client";
import { loadDb, run, uploadFiles, download } from "@/lib/db";
import { PROGRAM, TEAM, CUR_YEAR, MAIL_VARS, MAIL_SUBJECT, MAIL_BODY, fillMail, REPORTS, FIX_DAYS, CAP, MAX_MB, APPROVAL_THRESHOLD, BUDGET_LEVELS,
  CONSULT_TYPES, OPT_FIELDS, EXPERT_PREF_HINT, EXPERT_REPORTS, ST, CAT, NOTICES, fmt, iso, TODAY, won, mb, currentSettings } from "@/lib/config";

/* ══════════════════════════════════════════════════════════
   이음 · NGO PARTNERS PORTAL — 관리자 / 기관 / 전문가 3종 화면
   데이터: Supabase (lib/db.js 에서 조립). 모든 변경은 DB 쓰기 후 reload().
   ══════════════════════════════════════════════════════════ */

let ORGS = [];
const orgOf = (id) => ORGS.find((o) => o.id === id);
const subOf = (db, orgId, kind) => db.subs.find((x) => x.orgId === orgId && x.kind === kind);
const reportOf = (kind) => REPORTS.find((r) => r.key === kind) || REPORTS[0];
// 마감이 안 지난 첫 보고서, 없으면 마지막
const defaultKind = () => (REPORTS.find((r) => r.due >= TODAY) || REPORTS[REPORTS.length - 1]).key;
const ReportTabs = ({ kind, setKind }) => (
  <div className="tabs">
    {REPORTS.map((r) => (
      <div key={r.key} className={`tb ${kind === r.key ? "tb-on" : ""}`} onClick={() => setKind(r.key)}>
        {r.label}<span className="mono" style={{ fontSize: 10.5, color: "var(--ink3)", marginLeft: 6 }}>{r.due.slice(5)}</span>
      </div>
    ))}
  </div>
);
// 컨설팅 슬롯 = 일자(+시간). 시간이 없으면 하루 단위.
const slotsOf = (T) => T.slots || (T.dates || []).map((date) => ({ date, time: "" }));
const slotKey = (x) => x.time ? `${x.date} ${x.time}` : x.date;
// 컨설팅 1건 소요 시간(분). 회차별 설정(dur), 없으면 120분
const durOf = (T) => Number(T?.dur) || 120;
const typeOf = (key) => CONSULT_TYPES.find((t) => t.key === key);
const addMin = (hhmm, m) => { const [h, mi] = hhmm.split(":").map(Number); const t = h * 60 + mi + m; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
// 시간 표시 "15:00 ~ 17:00". 종료 시각은 x.end, 없으면 x.type 의 소요 시간으로 계산
const timeRange = (x) => { if (!x.time) return ""; const end = x.end || (x.type ? addMin(x.time, durOf(typeOf(x.type))) : ""); return end ? `${x.time} ~ ${end}` : x.time; };
const slotShort = (x) => `${Number(x.date.slice(8))}일${x.time ? " " + timeRange(x) : ""}`;
const slotLong = (x) => `${x.date.slice(5).replace(".", "월 ")}일${x.time ? " " + timeRange(x) : ""}`;
// 후보 일시 전개: 시간이 있는 후보는 그대로(종료 시각 붙임), 시간이 없는(종일) 후보는 09:00 부터 소요 시간 단위로 18:00 까지 쪼갬
const DAY_START = "09:00", DAY_END = "18:00";
const expandSlots = (T) => {
  const dur = durOf(T), out = [];
  for (const x of slotsOf(T)) {
    if (x.time) { out.push({ ...x, end: addMin(x.time, dur) }); continue; }
    for (let t = DAY_START; addMin(t, dur) <= DAY_END; t = addMin(t, dur)) out.push({ date: x.date, time: t, end: addMin(t, dur) });
  }
  return out;
};
const periodOf = (T) => { const ss = slotsOf(T); return ss.length ? `${ss[0].date} – ${ss[ss.length - 1].date.slice(5)}` : "일정 미정"; };
const sameSlot = (a, b) => a.date === b.date && (a.time || "") === (b.time || "");
// 확정 일정의 담당 전문가 이름 ("KCOC1 · 강도욱" 표기용). 미배정이면 빈 문자열
const expertName = (db, c) => (c?.expertId && db.experts.find((e) => e.id === c.expertId)?.name) || "";
// 기관 공개 시작 일시(open_at, "YYYY-MM-DDTHH:MM"). 이 시각부터 기관이 담당 전문가의 가능 일시를 보고 순위를 고를 수 있다.
const openAtOf = (T) => T.open_at || "";
const isOpen = (T) => !!openAtOf(T) && new Date(openAtOf(T)) <= new Date();
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const openAtLabel = (T) => { const v = openAtOf(T); if (!v) return ""; const d = new Date(v);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}시${d.getMinutes() ? ` ${d.getMinutes()}분` : ""}`; };
const isApply = (T) => T?.mode === "apply";
const appValue = (f, d) => {
  if (f.kind === "static") return f.key === "org" ? orgOf(d._orgId)?.name : d[f.key];
  if (f.kind === "multi") return [...(d[f.key] || []), ...(d[`${f.key}_other`] ? [`기타: ${d[`${f.key}_other`]}`] : [])].join(", ");
  return d[f.key];
};
const AppView = ({ app }) => (
  <div>
    {OPT_FIELDS.map((f) => (
      <div key={f.key} style={{ marginBottom: 6 }}>
        {f.section && <div style={{ fontSize: 11, fontWeight: 700, margin: "8px 0 4px" }}>{f.section}</div>}
        <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{f.label}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{appValue(f, { ...app.data, _orgId: app.orgId }) || "—"}</div>
      </div>
    ))}
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>희망 컨설턴트</div>
      <div style={{ fontSize: 12.5 }}>{app.expertPref || <span style={{ color: "var(--ink3)" }}>없음 · 사무국 추천 배정</span>}</div>
    </div>
  </div>
);
// 신청서 인쇄: 깨끗한 새 창에 내용만 찍고 인쇄 대화상자
const printApp = (app, T) => {
  const o = orgOf(app.orgId);
  const esc = (t) => String(t ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  const rows = OPT_FIELDS.map((f) => (f.section ? `<h2>${esc(f.section)}</h2>` : "") +
    `<div class="f"><div class="l">${esc(f.label)}</div><div class="v">${esc(appValue(f, { ...app.data, _orgId: app.orgId }) || "—")}</div></div>`).join("");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(T?.label || "컨설팅")} 신청서 · ${esc(o?.name)}</title>
<style>body{font-family:'Noto Sans KR',-apple-system,sans-serif;color:#1A2440;max-width:760px;margin:32px auto;padding:0 24px;font-size:13px;line-height:1.7}
h1{font-size:20px;margin:0 0 4px}.sub{color:#667391;font-size:12px;margin-bottom:22px}h2{font-size:13.5px;margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid #E6EAF3}
.f{margin-bottom:12px}.l{font-size:11px;color:#98A3BC}.v{white-space:pre-wrap}.foot{margin-top:28px;font-size:11px;color:#98A3BC}
@media print{body{margin:0}button{display:none}}</style></head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><img src="${location.origin}/logo-kcoc.png" style="height:36px"><span style="width:1px;height:26px;background:#E6EAF3"></span><img src="${location.origin}/logo-chest.png" style="height:36px"></div>
<h1>${esc(T?.label || "컨설팅")} 신청서</h1><div class="sub">${esc(o?.name)} · 제출 ${esc(app.at)} · ${esc(PROGRAM)}</div>
${rows}<div class="f"><div class="l">희망 컨설턴트</div><div class="v">${esc(app.expertPref || "없음 · 사무국 추천 배정")}</div></div>
<div class="foot">${esc(TEAM)} · 출력 ${esc(TODAY)}</div><script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) return false;
  w.document.write(html); w.document.close(); return true;
};
// 금액 입력: 화면에는 1,000,000 으로, onChange 에는 숫자만("1000000") 전달
const MoneyInput = ({ value, onChange, style, className, placeholder = "0" }) => (
  <input className={`mono ${className || ""}`} style={style} inputMode="numeric" placeholder={placeholder}
    value={value ? Number(value).toLocaleString("ko-KR") : ""}
    onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))} />
);
const MAX_RANK = 3;   // 기관이 고르는 희망 순위 개수
// settings.consult_types 의 한 회차만 부분 수정 (관리자 전용). 저장 후 reload() 필요.
const patchConsultType = (key, patch) => {
  const c = currentSettings();
  const consult_types = c.consult_types.map((t) => (t.key === key ? { ...t, ...patch } : t));
  return run(sb.from("settings").update({ data: { ...c, consult_types }, updated_at: new Date().toISOString() }).eq("id", 1));
};
// 예산변경 누적: 증감 부호와 무관하게 절댓값 합산. 외부(승인 문서)는 입력한 변경 금액.
const absSum = (rows) => rows.reduce((a, r) => a + Math.abs(Number(r.afterAmt) - Number(r.beforeAmt)), 0);
const extSum = (docs) => docs.filter((d) => d.kind === "budget").reduce((a, d) => a + Math.abs(Number(d.amount) || 0), 0);
const CHANGE_LIMIT = 0.2;   // 내부 + 외부 누적 변경 한도 (당해년도 예산 대비)
const dueFix = () => { const d = new Date(); d.setDate(d.getDate() + FIX_DAYS); return d.toISOString().slice(0, 10); };

/* ─────────── 소품 ─────────── */

const Badge = ({ s }) => <span className={`bg ${ST[s].cls}`}>{ST[s].label}</span>;

function Icon({ n }) {
  const p = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    doc: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
    cal: "M3 6h18v15H3zM3 10h18M8 3v4M16 3v4",
    won: "M4 7l3 10 3-8 3 8 3-10M3 11h18",
    box: "M3 7l9-4 9 4v10l-9 4-9-4z",
    org: "M4 21V7l8-4 8 4v14M9 21v-6h6v6",
    bell: "M4 6h11l5 5-5 5H4z",
    log: "M4 5h16M4 12h16M4 19h10",
    user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
    cog: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  }[n];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round"><path d={p} /></svg>;
}

function PageHead({ title, sub, right }) {
  return (
    <div className="cols" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
      <div><h1>{title}</h1><div className="sub">{sub}</div></div>
      {right}
    </div>
  );
}

// 파일 선택·검증만 담당. onDone(File[]) 을 호출하면 화면 쪽에서 uploadFiles() 로 올린다.
function Uploader({ onDone, label = "제출하기" }) {
  const [staged, setStaged] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  const OK = ["zip", "pdf", "hwp", "hwpx", "docx", "xlsx", "pptx", "jpg", "jpeg", "png"];

  const pick = (list) => {
    const arr = Array.from(list);
    const bad = arr.find((f) => !OK.includes((f.name.split(".").pop() || "").toLowerCase()));
    if (bad) { setErr(`허용되지 않는 파일 형식입니다 — ${bad.name} (zip · pdf · hwp · docx · xlsx · 이미지만 업로드할 수 있습니다)`); return; }
    const big = arr.find((f) => f.size > MAX_MB * 1048576);
    if (big) { setErr(`파일당 ${MAX_MB}MB를 초과했습니다 — ${big.name}`); return; }
    setErr(""); setStaged((s) => [...s, ...arr]);
  };
  const go = async () => {
    setBusy(true);
    try { await onDone(staged); setStaged([]); } catch {} finally { setBusy(false); }
  };

  return (
    <div>
      <input ref={ref} type="file" multiple style={{ display: "none" }}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <div className="drop" onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
        <div style={{ fontWeight: 500, marginBottom: 3 }}>파일을 끌어다 놓거나 클릭해 선택하세요</div>
        <div style={{ fontSize: 11.5, color: "var(--ink2s)" }}>zip · pdf · hwp · docx · xlsx · 이미지 · 파일당 {MAX_MB}MB</div>
      </div>
      {err && <div className="errmsg">{err}</div>}
      {busy && (
        <div style={{ marginTop: 13 }}>
          <div style={{ fontSize: 11.5, marginBottom: 5 }}>스토리지로 전송 중…</div>
          <div className="bar"><div style={{ width: "100%" }} /></div>
        </div>
      )}
      {staged.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink2s)" }}>{mb(f.size / 1048576)}</span>
            <button className="b2 bs" onClick={() => setStaged(staged.filter((_, j) => j !== i))}>제거</button>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 14 }}>
        <button className="b1" disabled={!staged.length || busy} onClick={go}>{label}</button>
      </div>
    </div>
  );
}

const FileRow = ({ f, say, onDown }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "7px 11px", background: "#FAFBFE", border: "1px solid var(--line2)", borderRadius: 6, marginTop: 7 }}>
    <span style={{ fontSize: 12 }}>{f.n}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{mb(f.s)}</span>
      <button className="b2 bs" onClick={() => { onDown?.(); download(f.path, f.n).catch(() => say("파일을 찾을 수 없습니다.")); }}>다운로드 ↓</button>
    </span>
  </div>
);

/* ═══════════ 메인 ═══════════ */

export default function Portal({ profile }) {
  const router = useRouter();
  const [db, setDb] = useState(null);
  const [page, setPage] = useState(null);
  const [detail, setDetail] = useState(null);
  const [kind, setKind] = useState(null);      // 현재 보고서 종류 (REPORTS.key)
  const [toast, setToast] = useState(null);
  const [popup, setPopup] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const reload = () => loadDb().then((d) => { ORGS = d.orgs; setDb(d); }).catch((e) => setLoadErr(e.message));

  const role = profile.role;
  const orgOf = (id) => db?.orgs.find((o) => o.id === id);
  const me = role === "org" ? orgOf(profile.org_id)
    : role === "expert" ? { id: profile.id, name: profile.name, title: profile.title, ini: profile.name[0] || "전" } : null;
  const who = role === "admin" ? `관리자 · ${profile.name || profile.email}` : role === "expert" ? `전문가 · ${profile.name}` : me?.name || "";
  const log = (action, target) => run(sb.from("logs").insert({ who, action, target }));

  useEffect(() => { reload(); }, []);
  // 기관 첫 진입 시 미확인 알림 팝업
  useEffect(() => {
    if (!db || role !== "org" || popup !== null) return;
    const un = db.alerts.filter((a) => a.orgId === profile.org_id && !a.read);
    if (un.length) setPopup(un);
  }, [db]);

  const closePopup = async () => {
    await run(sb.from("alerts").update({ read: true }).in("id", popup.map((p) => p.id)));
    setPopup(null); reload();
  };
  const go = (p) => { setPage(p); setDetail(null); };
  const logout = async () => { await sb.auth.signOut(); router.push("/login"); router.refresh(); };

  const NAV = {
    admin: [["dash", "통합 대시보드", "grid"], ["submit", "자료 제출 · 검토", "doc"],
      ["annual", "연간 사업 일정", "cal"], ["consult", "컨설팅 일정", "cal"],
      ["budget", "예산변경 / 사업변경", "won"], ["archive", "최종 자료실", "box"],
      ["orgs", "참여 기관", "org"], ["notice", "공지사항", "bell"], ["log", "활동 로그", "log"], ["users", "계정 관리", "user"], ["settings", "사업 설정", "cog"]],
    org: [["dash", "내 사업 현황", "grid"], ["submit", "자료 제출", "doc"],
      ["annual", "연간 사업 일정", "cal"], ["consult", "컨설팅 일정", "cal"],
      ["budget", "예산변경 / 사업변경", "won"], ["notice", "공지사항", "bell"]],
    expert: [["esubmit", "자료 제출", "doc"], ["econsult", "컨설팅 일정", "cal"]],
  }[role];
  const cur = page ?? NAV[0][0];
  const title = NAV.find((n) => n[0] === cur)?.[1] ?? "";

  if (loadErr) return <div className="ip" style={{ padding: 40 }}>데이터를 불러오지 못했습니다: {loadErr}</div>;
  if (!db) return <div className="ip" style={{ padding: 40, color: "var(--ink3)" }}>불러오는 중…</div>;

  if (role === "org" && (!me || me.ended)) return (
    <div className="ip" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 420, padding: "20px 22px" }}>
        <span className="bg g-red">접속 차단</span>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>{me ? "이용 기간이 종료된 계정입니다" : "연결된 기관이 없는 계정입니다"}</div>
        {me && <div style={{ fontSize: 12.5, color: "var(--ink2s)", marginTop: 8, lineHeight: 1.8 }}>
          {me.name} · {me.picked}년 선발<br />이용 가능 기간 {me.picked} — {me.picked + 2} (3년)</div>}
        <div style={{ textAlign: "right", marginTop: 14 }}><button className="b2" onClick={logout}>로그아웃</button></div>
      </div>
    </div>
  );

  const curKind = kind ?? defaultKind();
  const ctx = { db, reload, say, go, log, me, who, role, orgOf, detail, setDetail, profile, kind: curKind, setKind, R: reportOf(curKind) };

  return (
    <div className="ip shell" style={{ display: "flex", minHeight: "100vh" }}>
      <div className="side">
        <div className="brand"><div className="logo">n</div><span style={{ fontSize: 17, fontWeight: 700 }}>이음</span></div>
        <div className="brandsub">NGO PARTNERS PORTAL</div>
        <div className="logos" title="KCOC · 사랑의열매 사회복지공동모금회">
          <img src="/logo-kcoc.png" alt="KCOC" /><span className="sep" /><img src="/logo-chest.png" alt="사랑의열매 사회복지공동모금회" />
        </div>
        <div className="navcap">{role === "expert" ? "전문가 메뉴" : "사업 관리"}</div>
        <div className="navs">{NAV.map(([k, label, ic]) => (
          <div key={k} className={`nvi ${cur === k ? "nvi-on" : ""}`} onClick={() => go(k)}>
            <Icon n={ic} />{label}
          </div>
        ))}</div>
        <div className="sidefoot">
          <div style={{ color: "#fff", fontWeight: 500, marginBottom: 3 }}>{PROGRAM}</div>
          {role === "org"
            ? <>이용 기간 {me.picked} — {me.picked + 2} (3년)<br />{me.year}차년도 수행기관</>
            : <>{db.orgList.length}개 기관과 함께하는 사업<br />운영 기간 {CUR_YEAR}.03 — 12</>}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="top">
          <div className="crumb"><span className="crumbp">{PROGRAM} &nbsp;/&nbsp; </span><b>{title}</b></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="who" style={{ fontSize: 12, color: "var(--ink2s)" }}>{role === "org" ? me.name : `${profile.name} ${profile.title}`}</span>
            <button className="b2 bs" onClick={logout}>로그아웃</button>
            <div className="avat">{me ? me.ini : "관"}</div>
          </div>
        </div>

        <div className="wrap">
          {role === "admin" && <>
            {cur === "dash" && <AdminDash {...ctx} />}
            {cur === "submit" && <AdminSubmit {...ctx} />}
            {cur === "annual" && <Annual {...ctx} editable />}
            {cur === "consult" && <AdminConsult {...ctx} />}
            {cur === "budget" && <AdminBudget {...ctx} />}
            {cur === "archive" && <Archive {...ctx} />}
            {cur === "orgs" && <OrgsPage {...ctx} />}
            {cur === "notice" && <Notices go={go} />}
            {cur === "log" && <LogPage db={db} />}
            {cur === "users" && <Users {...ctx} />}
            {cur === "settings" && <Settings {...ctx} />}
          </>}
          {role === "org" && <>
            {cur === "dash" && <OrgDash {...ctx} />}
            {cur === "submit" && <OrgSubmit {...ctx} />}
            {cur === "annual" && <Annual {...ctx} />}
            {cur === "consult" && <OrgConsult {...ctx} />}
            {cur === "budget" && <OrgBudget {...ctx} />}
            {cur === "notice" && <Notices go={go} />}
          </>}
          {role === "expert" && <>
            {cur === "esubmit" && <ExpertSubmit {...ctx} />}
            {cur === "econsult" && <ExpertConsult {...ctx} />}
          </>}
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--ink3)", marginTop: 26 }}>이음 · NGO 사업관리 포털</div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {popup && (
        <div className="mask" onClick={closePopup}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px 4px" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>변경된 항목이 있습니다</div>
              <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 3 }}>
                마지막 접속 이후 처리된 내용입니다. 확인 후 닫으면 다시 표시되지 않습니다.
              </div>
            </div>
            <div style={{ padding: "12px 20px" }}>
              {popup.map((a) => (
                <div key={a.id} className="note" style={{ background: "var(--brandL)", color: "#2A3E70", marginBottom: 8 }}>
                  {a.text}
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 3 }}>{a.at}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "6px 20px 18px", textAlign: "right" }}>
              <button className="b1" onClick={closePopup}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ 관리자 : 대시보드 ═══════════ */

function AdminDash({ db, go, setDetail, kind, setKind, R }) {
  const subs = db.subs.filter((s) => s.kind === kind);
  const c = { none: 0, submitted: 0, reviewing: 0, revision: 0, approved: 0 };
  subs.forEach((s) => c[s.status]++);
  const pct = Math.round((c.approved / (subs.length || 1)) * 100);
  const pending = db.docs.filter((d) => d.status === "pending").length;
  const h2 = CONSULT_TYPES.find((t) => t.key === "h2");
  const applied = new Set(db.avail.filter((a) => a.type === "h2").map((a) => a.orgId)).size;
  const fixed = db.confirms.filter((c2) => c2.type === "h2").length;

  return (
    <div>
      <PageHead title="통합 대시보드" sub="기관별 진행 상황과 오늘 해야 할 업무를 살펴보세요." />
      <ReportTabs kind={kind} setKind={setKind} />

      <div className="card stats" style={{ display: "flex", padding: "14px 0", marginBottom: 14 }}>
        {[["미제출", c.none, "#98A3BC"], ["검토 중", c.reviewing, "#3E63C4"], ["수정 요청", c.revision, "#D9A03C"],
          ["최종 완료", c.approved, "#25A366"], ["승인 대기", pending, "#8A6BD9"]].map(([l, v, col]) => (
          <div key={l} style={{ flex: 1, display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px" }}>
            <span style={{ fontSize: 12, color: "var(--ink2s)" }}><span className="dot" style={{ background: col }} />{l}</span>
            <span><b className="mono" style={{ fontSize: 20 }}>{v}</b>
              <span style={{ fontSize: 11, color: "var(--ink3)", marginLeft: 2 }}>건</span></span>
          </div>
        ))}
      </div>

      <div className="cols" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>기관별 제출 현황 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{R.label}</span></h3>
              <span className="lnk" onClick={() => go("submit")}>전체 보기 →</span></div>
            <table>
              <thead><tr><th>기관명</th><th>진행 상태</th><th>최근 제출</th><th>버전</th><th /></tr></thead>
              <tbody>
                {subs.slice(0, 6).map((s) => {
                  const o = orgOf(s.orgId); const v = s.versions[s.versions.length - 1];
                  return (
                    <tr key={s.id} className="rw">
                      <td><span className="ini">{o.ini}</span><b style={{ fontWeight: 500 }}>{o.name}</b></td>
                      <td><Badge s={s.status} /></td>
                      <td className="mono" style={{ color: v ? "var(--brand2)" : "var(--ink3)" }}>{v ? v.at : "—"}</td>
                      <td className="mono" style={{ color: "var(--ink2s)" }}>{v ? `v${v.no}` : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="lnk" onClick={() => { go("submit"); setTimeout(() => setDetail(s.orgId), 0); }}>검토하기 →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px",
              borderTop: "1px solid var(--line2)", fontSize: 11, color: "var(--ink3)" }}>
              <span>{subs.length}개 기관 중 최대 6개 표시</span><span>마감일 {R.due}</span>
            </div>
          </div>

          <div className="card">
            <div className="chd"><h3>승인 대기 문서</h3><span className="lnk" onClick={() => go("budget")}>예산변경 관리 →</span></div>
            {pending === 0 ? <div style={{ padding: 26, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>대기 중인 문서가 없습니다.</div>
              : <table><tbody>
                {db.docs.filter((d) => d.status === "pending").map((d) => (
                  <tr key={d.id} className="rw">
                    <td><b style={{ fontWeight: 500 }}>{orgOf(d.orgId).name}</b></td>
                    <td><span className="bg g-sub">{d.kind === "budget" ? "예산변경" : "사업변경"}</span></td>
                    <td style={{ color: "var(--ink2s)" }}>{d.reason}</td>
                    <td className="mono" style={{ color: "var(--ink3)" }}>{d.at}</td>
                    <td style={{ textAlign: "right" }}><span className="lnk" onClick={() => go("budget")}>검토 →</span></td>
                  </tr>
                ))}
              </tbody></table>}
          </div>
        </div>

        <div style={{ width: 236, flexShrink: 0 }}>
          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>{R.label} 완료율</h3>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--ink2s)" }}>최종 승인 기준</span>
              <span><b className="mono" style={{ fontSize: 25, color: "var(--brand2)" }}>{pct}</b>
                <span style={{ fontSize: 12, color: "var(--brand2)" }}>%</span></span>
            </div>
            <div className="bar" style={{ margin: "7px 0 8px" }}><div style={{ width: `${pct}%` }} /></div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>전체 {subs.length}건 중 {c.approved}건 완료</div>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 13.5 }}>{h2.label}</h3>
            <div style={{ fontSize: 11.5, color: "var(--ink2s)", lineHeight: 1.9 }}>
              기간 {h2.period}<br />
              가능일자 신청 <b className="mono" style={{ color: "var(--ink)" }}>{applied}</b>/{db.orgList.length} 기관<br />
              일정 확정 <b className="mono" style={{ color: "var(--greenT)" }}>{fixed}</b>건
            </div>
            <button className="b1" style={{ width: "100%", marginTop: 11 }} onClick={() => go("consult")}>컨설팅 일정 관리 →</button>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: "0 0 11px", fontSize: 13.5 }}>최근 활동</h3>
            {db.logs.slice(0, 4).map((l, i) => (
              <div key={i} style={{ marginBottom: 11 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{l.action}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{l.target}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink3)" }}>{l.at} · {l.who}</div>
              </div>
            ))}
            <span className="lnk" onClick={() => go("log")}>전체 로그 →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ 관리자 : 자료 제출 · 검토 ═══════════ */

function AdminSubmit(ctx) {
  const { db, reload, say, log, who, detail, setDetail, kind, setKind, R } = ctx;
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [text, setText] = useState("");

  if (detail) {
    const o = orgOf(detail); const s = subOf(db, detail, kind);
    // ponytail: 여러 테이블 순차 쓰기 (트랜잭션 아님). 문제 생기면 Postgres 함수(rpc)로 묶을 것.
    const act = async (act_) => {
      if (act_ !== "start" && !text.trim()) { say("의견을 입력해 주세요."); return; }
      const vno = s.versions[s.versions.length - 1].no;
      try {
        if (act_ === "start") {
          await run(sb.from("submissions").update({ status: "reviewing" }).match({ org_id: detail, kind }));
        } else {
          await run(sb.from("feedbacks").insert({ org_id: detail, kind, v: vno, author: who, severity: act_ === "revise" ? "req" : "info", content: text.trim() }));
          if (act_ === "revise") {
            await run(sb.from("submissions").update({ status: "revision", due_fix: dueFix() }).match({ org_id: detail, kind }));
          } else {
            await run(sb.from("submissions").update({ status: "approved", due_fix: null }).match({ org_id: detail, kind }));
            await run(sb.from("versions").update({ final: false }).match({ org_id: detail, kind }));
            await run(sb.from("versions").update({ final: true }).match({ org_id: detail, kind, no: vno }));
            await run(sb.from("alerts").insert({ org_id: detail, text: `${R.label}가 최종 승인되었습니다.` }));
          }
          await log(act_ === "revise" ? "수정 요청" : "최종 승인", `${o.name} · ${R.label}`);
        }
      } catch (e) { say(`처리 실패: ${e.message}`); return; }
      setText(""); reload();
      say(act_ === "start" ? "검토를 시작했습니다." : act_ === "revise" ? "수정을 요청했습니다." : "최종 승인했습니다.");
    };

    return (
      <div>
        <div style={{ marginBottom: 14 }}><span className="lnk" onClick={() => { setDetail(null); setText(""); }}>← 목록으로</span></div>
        <PageHead title={`${o.name} · ${R.label}`} sub={`${o.year}차년도 수행기관 · 담당 ${db.managers[o.id].name} ${db.managers[o.id].title}`}
          right={<Badge s={s.status} />} />
        {s.status === "none" ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink3)" }}>
            아직 제출된 자료가 없습니다. 마감은 {R.due}입니다.
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chd"><h3>제출 버전 이력</h3></div>
              {s.versions.map((v) => (
                <div key={v.no} style={{ padding: "13px 16px", borderBottom: "1px solid var(--line2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <b className="mono" style={{ color: "var(--brand2)" }}>v{v.no}</b>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{v.at}</span>
                    {v.final && <span className="bg g-app">최종본</span>}
                  </div>
                  {v.note && <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 5 }}>변경 사항 — {v.note}</div>}
                  {v.files.map((f, i) => <FileRow key={i} f={f} say={say} onDown={() => log("파일 다운로드", `${o.name} · ${f.n}`)} />)}
                </div>
              ))}
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chd"><h3>검토 의견</h3></div>
              {s.feedbacks.length === 0
                ? <div style={{ padding: 28, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>등록된 의견이 없습니다.</div>
                : s.feedbacks.map((f) => (
                  <div key={f.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--line2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--ink3)", marginBottom: 5 }}>
                      <b style={{ color: "var(--ink)", fontWeight: 500 }}>{f.author}</b>
                      <span className="mono">{f.at}</span><span className="mono" style={{ color: "var(--brand2)" }}>v{f.v}</span>
                      {f.severity === "req" && <span className="bg g-req">수정 필요</span>}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>{f.content}</div>
                    {f.reply && <div style={{ marginTop: 9, paddingLeft: 11, borderLeft: "2px solid var(--line)" }}>
                      <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{o.name} 답변</div>
                      <div style={{ fontSize: 12 }}>{f.reply}</div></div>}
                  </div>
                ))}
            </div>

            {s.status === "approved" ? (
              <div className="card note" style={{ background: "var(--green)", color: "var(--greenT)" }}>
                최종 승인이 완료된 건입니다. 최종 자료실에서 ZIP으로 일괄 내려받을 수 있습니다.</div>
            ) : s.status === "revision" ? (
              <div className="card note" style={{ background: "var(--amber)", color: "var(--amberT)" }}>
                수정을 요청한 상태입니다. 기관의 재제출을 기다리는 중입니다 (수정 마감 {s.dueFix}).</div>
            ) : (
              <div className="card" style={{ padding: 18 }}>
                {s.status === "submitted" && (
                  <div style={{ marginBottom: 13 }}>
                    <button className="b2" onClick={() => act("start")}>검토 시작</button>
                    <span style={{ fontSize: 11.5, color: "var(--ink2s)", marginLeft: 10 }}>기관 화면에 '검토 중'으로 표시됩니다.</span>
                  </div>
                )}
                <label className="lbl">검토 의견 작성</label>
                <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="어느 항목이 어떻게 잘못되었고 무엇을 첨부하면 되는지 구체적으로 적어 주세요." />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <button className="b3" onClick={() => act("revise")}>수정 요청</button>
                  <span style={{ fontSize: 11.5, color: "var(--ink2s)" }}>수정 기한 {FIX_DAYS}일</span>
                  <div style={{ flex: 1 }} />
                  <button className="b1" onClick={() => act("approve")}>최종 승인</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const rows = db.subs.filter((s) => s.kind === kind && (filter === "all" || s.status === filter) && orgOf(s.orgId).name.includes(q));

  return (
    <div>
      <PageHead title="자료 제출 · 검토" sub="보고서 제출부터 최종 승인까지, 모든 흐름을 한곳에서 확인하세요." />
      <ReportTabs kind={kind} setKind={setKind} />
      <div className="card">
        <div className="chd"><h3>기관별 제출 현황 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{R.label}</span></h3>
          <span className="bg g-req" style={{ fontSize: 10.5 }}>제출 마감 {R.due}</span></div>
        <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
          <input type="text" placeholder="기관명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 116 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">모든 상태</option>
            {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <table>
          <thead><tr><th>기관명</th><th>진행 상태</th><th>최근 제출</th><th>버전</th><th /></tr></thead>
          <tbody>
            {rows.map((s) => {
              const o = orgOf(s.orgId); const v = s.versions[s.versions.length - 1];
              return (
                <tr key={s.id} className="rw">
                  <td><span className="ini">{o.ini}</span><b style={{ fontWeight: 500 }}>{o.name}</b></td>
                  <td><Badge s={s.status} /></td>
                  <td className="mono" style={{ color: v ? "var(--brand2)" : "var(--ink3)" }}>{v ? v.at : "—"}</td>
                  <td className="mono" style={{ color: "var(--ink2s)" }}>{v ? `v${v.no}` : "—"}</td>
                  <td style={{ textAlign: "right" }}><span className="lnk" onClick={() => setDetail(s.orgId)}>검토하기 →</span></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink3)", padding: 36 }}>조건에 맞는 기관이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════ 연간 사업 일정 (관리자 편집 가능) ═══════════ */

function Annual({ db, reload, say, log, me, editable }) {
  const [year, setYear] = useState(me?.year ?? 1);
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState({ m: 9, when: "", title: "", cat: "consult" });

  const list = db.roadmap[year].filter((e) => cat === "all" || e[3] === cat);
  const Q = [["1분기", `${CUR_YEAR}.01 — 03`, [1, 2, 3]], ["2분기", `${CUR_YEAR}.04 — 06`, [4, 5, 6]],
             ["3분기", `${CUR_YEAR}.07 — 09`, [7, 8, 9]], ["4분기", `${CUR_YEAR}.10 — 12`, [10, 11, 12]]];
  const thisMonth = new Date().getMonth() + 1;

  const FIELD = { 1: "when", 2: "title", 3: "cat" };
  const wrap = (fn) => fn().then(reload).catch((e) => say(`저장 실패: ${e.message}`));
  const upd = (id, field, val) => wrap(() => run(sb.from("roadmap").update({ [FIELD[field]]: val }).eq("id", id)));
  const del = (e) => wrap(async () => {
    await run(sb.from("roadmap").delete().eq("id", e[4]));
    await log("연간 일정 삭제", `${year}차년도 · ${e[2]}`);
  });
  const create = () => {
    if (!add.title.trim() || !add.when.trim()) { say("시기와 일정명을 모두 입력해 주세요."); return; }
    wrap(async () => {
      await run(sb.from("roadmap").insert({ year, m: Number(add.m), when: add.when.trim(), title: add.title.trim(), cat: add.cat }));
      await log("연간 일정 추가", `${year}차년도 · ${add.title}`);
      setAdd({ m: 9, when: "", title: "", cat: "consult" });
      say("일정을 추가했습니다.");
    });
  };

  return (
    <div>
      <PageHead title="연간 사업 일정" sub="수행 차년도별 주요 일정과 준비할 일을 한눈에 확인하세요."
        right={editable && <button className={edit ? "b1" : "b2"} onClick={() => setEdit(!edit)}>
          {edit ? "편집 종료" : "일정 편집"}</button>} />

      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.4, color: "var(--ink3)" }}>ANNUAL PROGRAM ROADMAP</div>
            <h2 style={{ margin: "3px 0 2px", fontSize: 17 }}>사업 흐름 계획표</h2>
            <div className="sub">사업 시작부터 결과 공유까지, 한 해의 주요 일정을 확인하세요.</div>
          </div>
          <span className={`bg ${edit ? "g-req" : "g-rev"}`} style={{ fontSize: 10.5, padding: "5px 10px" }}>
            {edit ? "편집 모드 · 관리자 전용" : `${TEAM} · 수행기관 공유용`}</span>
        </div>

        <div className="tabs" style={{ margin: "16px 0 14px" }}>
          {[1, 2, 3].map((y) => (
            <div key={y} className={`tb ${year === y ? "tb-on" : ""}`} onClick={() => setYear(y)}>{y}차년도 수행기관</div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className={`chip ${cat === "all" ? "chip-on" : ""}`} onClick={() => setCat("all")}>전체</button>
            {Object.entries(CAT).map(([k, v]) => (
              <button key={k} className={`chip ${cat === k ? "chip-on" : ""}`} onClick={() => setCat(k)}>
                <span className="dot" style={{ background: v.color }} />{v.label}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{list.length}개 일정</span>
        </div>

        {edit && (
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "#FCFDFF" }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 9 }}>일정 추가</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ width: 84 }} value={add.m} onChange={(e) => setAdd({ ...add, m: e.target.value })}>
                {[...Array(12)].map((_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
              </select>
              <input style={{ width: 150 }} placeholder="시기 (예: 9월 3주차)" value={add.when}
                onChange={(e) => setAdd({ ...add, when: e.target.value })} />
              <input placeholder="일정명" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
              <select style={{ width: 120 }} value={add.cat} onChange={(e) => setAdd({ ...add, cat: e.target.value })}>
                {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="b1" onClick={create}>추가</button>
            </div>
          </div>
        )}

        <div className="qrow" style={{ display: "flex", borderTop: "1px solid var(--line2)", paddingTop: 14 }}>
          {Q.map(([qn, qr, months], qi) => (
            <div key={qn} style={{ flex: 1, minWidth: 0, padding: "0 11px", borderLeft: qi ? "1px solid var(--line2)" : "none" }}>
              <div style={{ marginBottom: 12 }}>
                <b style={{ fontSize: 12 }}>{qn}</b>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink3)", marginLeft: 6 }}>{qr}</span>
              </div>
              {months.map((m) => {
                const evs = list.filter((e) => e[0] === m);
                return (
                  <div key={m} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11.5, color: evs.length ? "var(--brand2)" : "var(--ink3)", marginBottom: 6 }}>
                      <span className="dot" style={{ background: evs.length ? "var(--brand2)" : "var(--line)" }} />{CUR_YEAR}년 {m}월
                    </div>
                    {m === thisMonth && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", border: "2px solid var(--brand2)" }} />
                        <span className="mono" style={{ fontSize: 10, color: "var(--brand2)" }}>오늘 · {TODAY}</span>
                        <span style={{ flex: 1, height: 1, background: "#C9D6F0" }} />
                      </div>
                    )}
                    {evs.length === 0
                      ? <div style={{ fontSize: 11, color: "var(--ink3)" }}>예정된 주요 일정 없음</div>
                      : evs.map((e) => (
                        <div className="ev" key={e[4]}>
                          {edit ? (
                            <>
                              <input style={{ padding: "5px 8px", fontSize: 11, marginBottom: 5 }} defaultValue={e[1]}
                                onBlur={(ev) => ev.target.value !== e[1] && upd(e[4], 1, ev.target.value)} />
                              <input style={{ padding: "5px 8px", fontSize: 11.5, marginBottom: 5 }} defaultValue={e[2]}
                                onBlur={(ev) => ev.target.value !== e[2] && upd(e[4], 2, ev.target.value)} />
                              <div style={{ display: "flex", gap: 5 }}>
                                <select style={{ padding: "4px 6px", fontSize: 10.5 }} value={e[3]}
                                  onChange={(ev) => upd(e[4], 3, ev.target.value)}>
                                  {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                                <button className="b2 bs" onClick={() => del(e)}>삭제</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{e[1]}</div>
                              <div style={{ fontSize: 12.5, fontWeight: 500, margin: "2px 0 6px" }}>{e[2]}</div>
                              <span className={`bg ${CAT[e[3]].bg}`} style={{ fontSize: 10 }}>{CAT[e[3]].label}</span>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ 컨설팅 — 관리자 ═══════════ */

function AdminConsult({ db, reload, say, log }) {
  const [type, setType] = useState("h2");
  const [pick, setPick] = useState({});
  const [pickExp, setPickExp] = useState({});   // 기관별 담당 전문가 선택
  const [zoom, setZoom] = useState({});
  const T = CONSULT_TYPES.find((t) => t.key === type);

  const avail = db.avail.filter((a) => a.type === type);
  const confirms = db.confirms.filter((c) => c.type === type);
  const orgIds = [...new Set(avail.map((a) => a.orgId))];
  const slots = expandSlots(T);                 // 1단계 표: 전문가가 고를 수 있는 시간 단위 후보
  const countOn = (x) => confirms.filter((c) => sameSlot(c, x)).length;

  // ── 1단계: 전문가 가능 일시 조사 · 기관별 담당 전문가 · 기관 공개 시작 일시 ──
  const eAvail = db.expertAvail.filter((a) => a.type === type);
  const expertsOn = (x) => eAvail.filter((a) => sameSlot(a, x)).map((a) => db.experts.find((e) => e.id === a.expertId)?.name || "?");
  const answered = new Set(eAvail.map((a) => a.expertId)).size;
  const noteOf = (eid) => db.expertNotes.find((n) => n.expertId === eid && n.type === type)?.note || "";
  const [openAt, setOpenAt] = useState(null);      // null = 저장값
  const openAtVal = openAt ?? openAtOf(T);
  useEffect(() => { setOpenAt(null); }, [type]);
  const saveOpenAt = async () => {
    try { await patchConsultType(type, { open_at: openAtVal }); await log("컨설팅 기관 공개 일시 설정", `${T.label} · ${openAtVal || "미설정"}`); }
    catch (e) { say(`처리 실패: ${e.message}`); return; }
    await reload(); setOpenAt(null);
    say(openAtVal ? `${openAtLabel({ open_at: openAtVal })}부터 기관이 일정을 선택할 수 있습니다.` : "기관 공개를 해제했습니다.");
  };
  const setOrgExpert = async (orgId, expertId) => {
    try { await run(sb.from("orgs").update({ expert_id: expertId || null }).eq("id", orgId));
      await log("담당 전문가 배정", `${orgOf(orgId).name} · ${db.experts.find((e) => e.id === expertId)?.name || "해제"}`); }
    catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
  };

  // 신청서 방식: 사무국이 전문가·일시를 직접 배정
  const apps = db.consultApps.filter((a) => a.type === type);
  const [assign, setAssign] = useState({});   // {orgId: {expertId, date, time}}
  const assignOf = (oid) => { const cf = confirms.find((c) => c.orgId === oid); return assign[oid] || { expertId: cf?.expertId || "", date: cf?.date || "", time: cf?.time || "" }; };
  const doAssign = async (oid) => {
    const a = assignOf(oid);
    if (!a.date) { say("일자를 입력해 주세요."); return; }
    const x = { date: a.date, time: a.time || "" };
    if (a.expertId && confirms.some((c) => c.expertId === a.expertId && sameSlot(c, x) && c.orgId !== oid)) { say("같은 일시에 해당 전문가의 타 기관 컨설팅이 확정되어 있습니다."); return; }
    const eName = db.experts.find((e) => e.id === a.expertId)?.name;
    try {
      await run(sb.from("confirms").upsert({ org_id: oid, type, date: iso(a.date), time: x.time, expert_id: a.expertId || null }));
      await run(sb.from("alerts").insert({ org_id: oid, text: `${T.label} 일정이 ${slotLong(x)}로 확정되었습니다.${eName ? ` (담당 전문가 ${eName})` : ""}` }));
      await log("선택컨설팅 배정", `${orgOf(oid).name} · ${slotShort(x)}${eName ? ` · ${eName}` : ""}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload(); setAssign({ ...assign, [oid]: undefined });
    say(`배정했습니다 — ${orgOf(oid).name} · ${slotShort(x)}`);
  };
  const [openApp, setOpenApp] = useState(null);   // 신청서 보기 모달 (app)

  const byRank = (a, b) => (a.rank || 99) - (b.rank || 99);
  // 그 시간대에 이미 다른 기관에 배정된 전문가인지
  const expertBusy = (expertId, x, orgId) => !!expertId && confirms.some((c) => c.expertId === expertId && sameSlot(c, x) && c.orgId !== orgId);
  const confirm = async (orgId) => {
    const key = pick[orgId] ?? [confirms.find((c) => c.orgId === orgId), avail.filter((a) => a.orgId === orgId).sort(byRank)[0]].filter(Boolean).map(slotKey)[0];
    const x = slots.find((z) => slotKey(z) === key) || avail.find((a) => a.orgId === orgId && slotKey(a) === key);
    if (!x) { say("가능 일시가 없습니다."); return; }
    const already = confirms.find((c) => c.orgId === orgId);
    if (!(already && sameSlot(already, x)) && countOn(x) >= CAP) {
      say(`${slotShort(x)}은(는) 정원 ${CAP}개 기관이 모두 찼습니다. 다른 일시를 선택해 주세요.`); return;
    }
    // 담당 전문가: 선택값 → 기존 배정 → 기관의 담당 전문가(orgs.expert_id)
    const expert_id = pickExp[orgId] ?? already?.expertId ?? orgOf(orgId).expertId ?? null;
    if (expertBusy(expert_id, x, orgId)) { say("이 시간대는 해당 전문가의 타 기관 컨설팅이 확정되어 있습니다. 다른 시간대나 전문가를 선택해 주세요."); return; }
    const eName = db.experts.find((e) => e.id === expert_id)?.name;
    try {
      await run(sb.from("confirms").upsert({ org_id: orgId, type, date: iso(x.date), time: x.time || "", expert_id: expert_id || null }));
      await run(sb.from("alerts").insert({ org_id: orgId, text: `${T.label} 일정이 ${slotLong(x)}로 확정되었습니다.${eName ? ` (담당 전문가 ${eName})` : ""}` }));
      await log("컨설팅 일정 확정", `${orgOf(orgId).name} · ${T.label} ${slotShort(x)}${eName ? ` · ${eName}` : ""}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say(`확정했습니다 — ${orgOf(orgId).name} · ${slotShort(x)}`);
  };

  // 발송 전 미리보기 → 확인 후 send()
  const [preview, setPreview] = useState(null);   // { orgId, url, subject, body, to, retry }
  const [sending, setSending] = useState(false);
  const zoomOf = (orgId) => (zoom[orgId] ?? db.confirms.find((c) => c.orgId === orgId && c.type === type)?.zoom ?? "").trim();
  const openPreview = (orgId, retry) => {
    const url = zoomOf(orgId);
    if (!url) { say("Zoom 링크를 입력해 주세요."); return; }
    if (!/^https?:\/\//.test(url)) { say("http:// 또는 https:// 로 시작하는 주소를 입력해 주세요."); return; }
    const o = orgOf(orgId), mgr = db.managers[orgId], cf = confirms.find((c) => c.orgId === orgId);
    const v = { "{기관명}": o.name, "{담당자}": `${mgr.name} ${mgr.title}`.trim(), "{차년도}": String(o.year), "{회차}": T.label,
      "{일시}": cf ? `${cf.date}${cf.time ? " " + timeRange(cf) : ""}` : "(미확정)", "{링크}": url, "{부서}": TEAM, "{사업명}": PROGRAM };
    setPreview({ orgId, url, retry, to: mgr.email, subject: fillMail(MAIL_SUBJECT, v), body: fillMail(MAIL_BODY, v) });
  };
  const saveZoom = (orgId) => openPreview(orgId, false);
  const retry = (orgId) => openPreview(orgId, true);
  const send = async () => {
    const { orgId, url, retry: isRetry, to } = preview;
    setSending(true);
    const r = await fetch("/api/zoom", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, type, zoom: url }) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
    setSending(false); setPreview(null);
    if (r.error) { say(`처리 실패: ${r.error}`); return; }
    if (r.ok && !isRetry) await run(sb.from("alerts").insert({ org_id: orgId, text: `${T.label} Zoom 링크가 등록되었습니다. 담당자 이메일로 안내가 발송되었습니다.` }));
    await log(r.ok ? (isRetry ? "안내 메일 재발송" : "Zoom 링크 등록 · 메일 발송") : "안내 메일 발송 실패", `${orgOf(orgId).name} → ${to}`);
    reload();
    say(r.ok ? `${to}로 안내 메일을 발송했습니다.` : `Zoom 링크는 저장했지만 메일 발송에 실패했습니다 (${r.reason}). 재시도 버튼으로 다시 보낼 수 있습니다.`);
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub="① 전문가 가능 일시 검토 → 기관별 담당 전문가 배정 → 기관 공개 시작 일시 지정 → ② 기관 희망 순위 확인 → 매칭 승인 → Zoom 안내" />

      <div className="tabs">
        {CONSULT_TYPES.map((t) => (
          <div key={t.key} className={`tb ${type === t.key ? "tb-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}{t.required && <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 6 }}>필수</span>}
          </div>
        ))}
      </div>

      {isApply(T) ? (
      <div className="card">
        <div className="chd"><h3>{T.label} 신청서</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{apps.length}개 기관 신청 · {confirms.length}건 배정</span></div>
        <table>
          <thead><tr><th style={{ width: 150 }}>기관</th><th>신청 내용</th><th style={{ width: 130 }}>희망 전문가</th>
            <th style={{ width: 360 }}>전문가 · 일시 배정</th><th style={{ width: 250 }}>Zoom 링크 / 안내 메일</th></tr></thead>
          <tbody>
            {apps.map((ap) => {
              const oid = ap.orgId, o = orgOf(oid), cf = confirms.find((c) => c.orgId === oid), a = assignOf(oid);
              const failed = db.mailFails.some((f) => f.orgId === oid);
              const setA = (patch) => setAssign({ ...assign, [oid]: { ...a, ...patch } });
              return (
                <tr key={oid}>
                  <td style={{ verticalAlign: "top" }}><b style={{ fontWeight: 500, color: cf ? "var(--greenT)" : "var(--ink)" }}>{o.name}</b>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink3)" }}>제출 {ap.at}</div>
                    {cf ? <span className="bg g-app" style={{ marginTop: 4 }}>배정 완료</span> : <span className="bg g-rev" style={{ marginTop: 4 }}>배정 대기</span>}</td>
                  <td style={{ verticalAlign: "top", fontSize: 12 }}>
                    <div style={{ fontWeight: 500 }}>{appValue(OPT_FIELDS.find((f) => f.key === "field"), ap.data) || "—"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ap.data.reason}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button className="b2 bs" onClick={() => setOpenApp(ap)}>신청서 보기</button>
                      <button className="b2 bs" onClick={() => { if (!printApp(ap, T)) say("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요."); }}>인쇄</button>
                    </div>
                  </td>
                  <td style={{ verticalAlign: "top", fontSize: 11.5 }}>{ap.expertPref || <span style={{ color: "var(--ink3)" }}>없음 · 사무국 배정</span>}</td>
                  <td style={{ verticalAlign: "top" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <select style={{ width: 120, padding: "5px 7px" }} value={a.expertId} onChange={(e) => setA({ expertId: e.target.value })}>
                        <option value="">전문가 선택</option>
                        {db.experts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      <input type="date" style={{ width: 140, padding: "5px 7px" }} value={a.date ? iso(a.date) : ""} onChange={(e) => setA({ date: fmt(e.target.value) })} />
                      <input type="time" style={{ width: 100, padding: "5px 7px" }} value={a.time} onChange={(e) => setA({ time: e.target.value })} />
                      <button className="b1 bs" onClick={() => doAssign(oid)}>{cf ? "변경" : "배정·확정"}</button>
                    </div>
                    {cf && <div style={{ fontSize: 10.5, marginTop: 4, color: "var(--ink3)" }}>확정 {slotShort(cf)}{expertName(db, cf) ? ` · ${expertName(db, cf)}` : " · 전문가 미배정"}</div>}
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    {!cf ? <span style={{ fontSize: 11, color: "var(--ink3)" }}>배정 후 입력 가능</span> : (
                      <>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input style={{ padding: "5px 8px", fontSize: 11 }} placeholder="https://zoom.us/j/..."
                            value={zoom[oid] ?? cf.zoom} onChange={(e) => setZoom({ ...zoom, [oid]: e.target.value })} />
                          <button className="b1 bs" onClick={() => saveZoom(oid)}>저장·발송</button>
                        </div>
                        <div style={{ fontSize: 10.5, marginTop: 4, color: failed ? "var(--redT)" : "var(--ink3)" }}>
                          {failed ? <>발송 실패 · <span className="lnk" onClick={() => retry(oid)}>재시도</span></>
                            : cf.mailedAt ? `${cf.mailedAt} → ${db.managers[oid].email}` : `수신처 ${db.managers[oid].email}`}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!apps.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 34, color: "var(--ink3)" }}>아직 신청서를 제출한 기관이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      ) : (<>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chd"><h3>1단계 · 전문가 가능 일시 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{answered}/{db.experts.length}명 응답</span></h3>
          {isOpen(T) ? <span className="bg g-app" style={{ fontSize: 10.5 }}>기관 접수 중 · {openAtLabel(T)}부터</span>
            : openAtOf(T) ? <span className="bg g-rev" style={{ fontSize: 10.5 }}>기관 공개 예정 · {openAtLabel(T)}</span>
            : <span className="bg g-req" style={{ fontSize: 10.5 }}>전문가 조사 중 · 기관에는 아직 안 보임</span>}</div>
        <div style={{ padding: 16 }}>
          {slots.length === 0 && <div style={{ fontSize: 12, color: "var(--ink3)" }}>사업 설정에서 이 회차의 후보 일시를 먼저 등록해 주세요.</div>}
          {slots.length > 0 && (() => {
            // 날짜를 열, 시간대를 행으로 놓은 격자. 칸마다 가능한 전문가 이름
            const dates = [...new Set(slots.map((x) => x.date))];
            const times = [...new Set(slots.map((x) => timeRange(x) || "종일"))];
            const at = (d, t) => slots.find((x) => x.date === d && (timeRange(x) || "종일") === t);
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 120 + dates.length * 150 }}>
                  <thead><tr><th style={{ width: 120 }}>시간대</th>
                    {dates.map((d) => <th key={d} style={{ textAlign: "center" }}>{Number(d.slice(5, 7))}월 {Number(d.slice(8))}일</th>)}</tr></thead>
                  <tbody>
                    {times.map((t) => (
                      <tr key={t}>
                        <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}><b>{t}</b></td>
                        {dates.map((d) => {
                          const x = at(d, t);
                          if (!x) return <td key={d} style={{ background: "var(--line2)" }} />;
                          const names = expertsOn(x);
                          return (
                            <td key={d} style={{ verticalAlign: "top", background: names.length ? "var(--brandL)" : "transparent", fontSize: 11, lineHeight: 1.6 }}>
                              {names.length ? names.map((n) => <span key={n} className="bg g-app" style={{ display: "inline-block", marginRight: 3, marginBottom: 2, fontSize: 10.5 }}>{n}</span>)
                                : <span style={{ color: "var(--ink3)" }}>—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {db.experts.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>전문가별 응답</div>
              <table>
                <thead><tr><th style={{ width: 140 }}>전문가</th><th style={{ width: 90 }}>상태</th><th>선택한 가능 일시</th><th style={{ width: 260 }}>추가 가능 시간 (주관식)</th></tr></thead>
                <tbody>
                  {db.experts.map((e) => {
                    const ds = eAvail.filter((a) => a.expertId === e.id).sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
                    const note = noteOf(e.id);
                    return (
                      <tr key={e.id}>
                        <td><b style={{ fontWeight: 500 }}>{e.name}</b>{e.title && <span style={{ fontSize: 10.5, color: "var(--ink3)", marginLeft: 5 }}>{e.title}</span>}</td>
                        <td>{ds.length || note ? <span className="bg g-app">응답 완료</span> : <span className="bg g-not">응답 이전</span>}</td>
                        <td style={{ fontSize: 11.5 }}>
                          {ds.length ? ds.map((x) => <span key={slotKey(x)} className="bg g-rev" style={{ marginRight: 4, fontSize: 10.5 }}>{slotShort(x)}</span>)
                            : <span style={{ color: "var(--ink3)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: 11.5, whiteSpace: "pre-wrap" }}>{note || <span style={{ color: "var(--ink3)" }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>기관별 담당 전문가 <span style={{ fontWeight: 400, color: "var(--ink3)" }}>— 기관은 담당 전문가의 가능 일시만 봅니다</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {db.orgList.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line2)", borderRadius: 6, padding: "5px 8px" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 500 }}>{o.name}</span>
                  <select style={{ width: 120, padding: "4px 6px", fontSize: 11 }} value={o.expertId || ""} onChange={(e) => setOrgExpert(o.id, e.target.value)}>
                    <option value="">미배정</option>
                    {db.experts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line2)" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>기관 공개 시작 일시</span>
            <IN type="datetime-local" style={{ width: 210 }} value={openAtVal} onChange={(e) => setOpenAt(e.target.value)} />
            <button className="b1 bs" onClick={saveOpenAt}>저장</button>
            {openAtOf(T) && <button className="b2 bs" onClick={() => { setOpenAt(""); }}>해제</button>}
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>이 시각부터 기관 화면에 "담당 전문가의 가능 일시"가 열리고 1·2·3순위를 고를 수 있습니다.</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chd"><h3>2단계 · {T.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{periodOf(T)}</span></h3>
          <span className="bg g-rev" style={{ fontSize: 10.5 }}>일시별 정원 {CAP}개 기관 · 1회 {durOf(T)}분</span></div>
        <div style={{ display: "flex", gap: 10, padding: 16, flexWrap: "wrap" }}>
          {slots.length === 0 && <div style={{ fontSize: 12, color: "var(--ink3)" }}>사업 설정에서 이 회차의 일시를 먼저 등록해 주세요.</div>}
          {[...new Set(slots.map((x) => x.date))].map((d) => (
            <div key={d} className="card" style={{ flex: "1 1 160px", padding: 12, background: "#FCFDFF" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{Number(d.slice(8))}일</div>
              <div style={{ fontSize: 10.5, color: "var(--ink3)", marginBottom: 8 }}>{d.slice(0, 7)}</div>
              {slots.filter((x) => x.date === d).map((x) => {
                const n = countOn(x);
                return (
                  <div key={slotKey(x)} style={{ marginBottom: 7, paddingTop: 6, borderTop: "1px solid var(--line2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <b className="mono">{timeRange(x) || "종일"}</b>
                      <span style={{ color: n >= CAP ? "var(--redT)" : "var(--ink2s)" }}>확정 {n}/{CAP}{n >= CAP && " · 마감"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>체크 {avail.filter((a) => sameSlot(a, x)).length}개 기관</div>
                    {confirms.filter((c) => sameSlot(c, x)).map((c) => (
                      <div key={c.orgId} className="bg g-app" style={{ fontSize: 10, marginTop: 4, display: "block" }}>
                        {orgOf(c.orgId).name}{expertName(db, c) ? ` · ${expertName(db, c)}` : ""}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="chd"><h3>기관별 일정 신청</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{orgIds.length}개 기관 신청 · {confirms.length}건 확정</span></div>
        <table>
          <thead><tr><th style={{ width: 140 }}>기관 · 담당 전문가</th><th>희망 순위</th><th style={{ width: 78 }}>상태</th>
            <th style={{ width: 300 }}>일정 확정 · 담당 전문가</th><th style={{ width: 250 }}>Zoom 링크 / 안내 메일</th></tr></thead>
          <tbody>
            {orgIds.map((oid) => {
              const o = orgOf(oid);
              const ds = avail.filter((a) => a.orgId === oid).sort(byRank);
              const cf = confirms.find((c) => c.orgId === oid);
              const curKey = pick[oid] ?? (cf ? slotKey(cf) : slotKey(ds[0]));
              const curSlot = ds.find((x) => slotKey(x) === curKey) || cf;
              const failed = db.mailFails.some((f) => f.orgId === oid);
              return (
                <tr key={oid}>
                  <td><b style={{ fontWeight: 500, color: cf ? "var(--greenT)" : "var(--ink)" }}>{o.name}</b>
                    <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{db.experts.find((e) => e.id === o.expertId)?.name || "담당 전문가 미배정"}</div></td>
                  <td style={{ fontSize: 11.5, color: "var(--brand2)" }}>
                    {ds.map((x, i) => <span key={slotKey(x)} className="bg g-rev" style={{ marginRight: 4, marginBottom: 3, fontSize: 10.5, display: "inline-block" }}>
                      <b style={{ marginRight: 3 }}>{x.rank || i + 1}순위</b>{slotShort(x)}</span>)}
                  </td>
                  <td>{cf ? <span className="bg g-app">확정</span> : <span className="bg g-rev">신청 완료</span>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select style={{ width: 130, padding: "5px 7px" }} value={curKey}
                        onChange={(e) => setPick({ ...pick, [oid]: e.target.value })}>
                        {ds.map((x, i) => <option key={slotKey(x)} value={slotKey(x)}>{x.rank || i + 1}순위 {slotShort(x)}</option>)}
                      </select>
                      <select style={{ width: 130, padding: "5px 7px" }} value={pickExp[oid] ?? cf?.expertId ?? ""}
                        onChange={(e) => setPickExp({ ...pickExp, [oid]: e.target.value })}>
                        <option value="">담당 전문가</option>
                        {db.experts.map((e) => { const busy = curSlot && expertBusy(e.id, curSlot, oid);
                          return <option key={e.id} value={e.id} disabled={busy}>{e.name}{busy ? " · 타 기관 컨설팅 확정" : ""}</option>; })}
                      </select>
                      <button className="b1 bs" onClick={() => confirm(oid)}>{cf ? "변경" : "매칭 승인"}</button>
                    </div>
                    {cf && <div style={{ fontSize: 10.5, marginTop: 4, color: "var(--ink3)" }}>확정 {slotShort(cf)}{expertName(db, cf) ? ` · ${expertName(db, cf)}` : " · 전문가 미배정"}</div>}
                  </td>
                  <td>
                    {!cf ? <span style={{ fontSize: 11, color: "var(--ink3)" }}>확정 후 입력 가능</span> : (
                      <>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input style={{ padding: "5px 8px", fontSize: 11 }} placeholder="https://zoom.us/j/..."
                            value={zoom[oid] ?? cf.zoom} onChange={(e) => setZoom({ ...zoom, [oid]: e.target.value })} />
                          <button className="b1 bs" onClick={() => saveZoom(oid)}>저장·발송</button>
                        </div>
                        <div style={{ fontSize: 10.5, marginTop: 4, color: failed ? "var(--redT)" : "var(--ink3)" }}>
                          {failed ? <>발송 실패 · <span className="lnk" onClick={() => retry(oid)}>재시도</span></>
                            : cf.mailedAt ? `${cf.mailedAt} → ${db.managers[oid].email}`
                            : `수신처 ${db.managers[oid].email}`}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!orgIds.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 34, color: "var(--ink3)" }}>
              아직 가능 일자를 신청한 기관이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="chd"><h3>{T.label} 사전 정보</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>기관이 이 회차 전에 작성 · {Object.values(db.pre).filter((p) => p[type]).length}개 기관 제출</span></div>
        {Object.values(db.pre).filter((p) => p[type]).length === 0
          ? <div style={{ padding: 30, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>제출된 사전 정보가 없습니다.</div>
          : Object.entries(db.pre).filter(([, p]) => p[type]).map(([oid, pp]) => [oid, pp[type]]).map(([oid, p]) => (
            <div key={oid} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <b style={{ fontWeight: 700 }}>{orgOf(Number(oid)).name}</b>
                <span className="bg g-rev">예산 집행률 {p.rate}%</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink3)" }}>{p.at}</span>
              </div>
              {[["세부활동별 진행현황", p.progress], ["현지 여건 및 주요 이슈", p.country], ["전문가 자문 요청사항", p.ask]].map(([l, v]) => (
                <div key={l} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{l}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>{v}</div>
                </div>
              ))}
            </div>
          ))}
      </div>
      </>)}

      {openApp && (
        <div className="mask" onClick={() => setOpenApp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{orgOf(openApp.orgId).name} · {T.label} 신청서</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>제출 {openApp.at}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="b1 bs" onClick={() => { if (!printApp(openApp, T)) say("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요."); }}>인쇄</button>
                <button className="b2 bs" onClick={() => setOpenApp(null)}>닫기</button>
              </div>
            </div>
            <div style={{ padding: "8px 22px 22px", overflow: "auto" }}><AppView app={openApp} /></div>
          </div>
        </div>
      )}

      {preview && (
        <div className="mask" onClick={() => !sending && setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ padding: "18px 20px 6px" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{preview.retry ? "안내 메일 재발송" : "안내 메일 발송"} 전 확인</div>
              <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 3 }}>받는 사람 <b style={{ color: "var(--brand2)" }}>{preview.to}</b> · 문구는 사업 설정에서 바꿀 수 있습니다.</div>
            </div>
            <div style={{ padding: "8px 20px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, padding: "8px 12px", background: "var(--gray)", borderRadius: 6 }}>{preview.subject}</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.8, padding: "12px 12px", border: "1px solid var(--line)", borderRadius: 6, marginTop: 8, maxHeight: 360, overflow: "auto" }}>{preview.body}</div>
            </div>
            <div style={{ padding: "8px 20px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="b2" disabled={sending} onClick={() => setPreview(null)}>취소</button>
              <button className="b1" disabled={sending} onClick={send}>{sending ? "발송 중…" : "발송"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════ 컨설팅 — 기관 ═══════════ */

function OrgConsult({ db, reload, say, log, me }) {
  const [type, setType] = useState("h2");
  const T = CONSULT_TYPES.find((t) => t.key === type);
  const byRank = (a, b) => (a.rank || 99) - (b.rank || 99);
  const mine = db.avail.filter((a) => a.orgId === me.id && a.type === type).sort(byRank).map(slotKey);
  const [picks, setPicks] = useState(mine);   // 체크한 순서 = 희망 순위
  const open = isOpen(T);                                     // 공개 시작 일시가 지났는지
  const myExpert = db.experts.find((e) => e.id === me.expertId);
  // 담당 전문가가 가능하다고 한 일시만
  const slots = open && myExpert ? expandSlots(T).filter((x) => db.expertAvail.some((a) => a.type === type && a.expertId === me.expertId && sameSlot(a, x))) : [];
  // 같은 전문가를 공유하는 다른 기관이 1순위로 골랐거나 이미 확정된 일시 = 선점
  const sameExpertOrgs = db.orgs.filter((o) => o.id !== me.id && o.expertId && o.expertId === me.expertId).map((o) => o.id);
  const taken = (x) => db.confirms.some((c) => c.type === type && c.orgId !== me.id && c.expertId === me.expertId && sameSlot(c, x))
    || db.avail.some((a) => a.type === type && a.rank === 1 && sameExpertOrgs.includes(a.orgId) && sameSlot(a, x));
  const cf = db.confirms.find((c) => c.orgId === me.id && c.type === type);
  const savedPre = db.pre[me.id]?.[type];                      // 회차별로 따로 저장
  const pre = savedPre || { rate: "", progress: "", country: "", ask: "" };
  const [form, setForm] = useState(pre);
  const [errs, setErrs] = useState({});
  const [editPre, setEditPre] = useState(!savedPre);   // 저장된 내용이 있으면 열람 모드로 시작
  // 신청서 방식(선택컨설팅)
  const app = db.consultApps.find((a) => a.orgId === me.id && a.type === type);
  const blankApp = (ap) => ({ manager: db.managers[me.id]?.name || "", ...(ap?.data || {}), expertPref: ap?.expertPref || "" });
  const [appForm, setAppForm] = useState(() => blankApp(app));
  const [editApp, setEditApp] = useState(!app);
  const [appErrs, setAppErrs] = useState({});

  useEffect(() => {
    setPicks(db.avail.filter((a) => a.orgId === me.id && a.type === type).sort(byRank).map(slotKey));
    const sp = db.pre[me.id]?.[type];
    setForm(sp || { rate: "", progress: "", country: "", ask: "" }); setEditPre(!sp); setErrs({});
    const ap = db.consultApps.find((a) => a.orgId === me.id && a.type === type);
    setAppForm(blankApp(ap)); setEditApp(!ap); setAppErrs({});
  }, [type, me.id]);

  const saveApp = async () => {
    const e = {};
    OPT_FIELDS.forEach((f) => {
      if (f.kind === "static") return;
      if (f.kind === "multi") { if (f.required && !(appForm[f.key] || []).length && !String(appForm[`${f.key}_other`] || "").trim()) e[f.key] = 1; return; }
      const v = String(appForm[f.key] || "").trim();
      if (f.required && !v) e[f.key] = 1;
      if (f.max && v.length > f.max) e[f.key] = `${f.max}자 이내`;
    });
    setAppErrs(e);
    if (Object.keys(e).length) { say(Object.values(e).some((x) => x !== 1) ? "글자 수 제한을 넘은 항목이 있습니다." : "입력하지 않은 필수 항목이 있습니다."); return; }
    const data = {};
    OPT_FIELDS.forEach((f) => {
      if (f.kind === "static") return;
      if (f.kind === "multi") { data[f.key] = appForm[f.key] || []; data[`${f.key}_other`] = String(appForm[`${f.key}_other`] || "").trim(); return; }
      data[f.key] = String(appForm[f.key] || "").trim();
    });
    try {
      await run(sb.from("consult_apps").upsert({ org_id: me.id, type, data, expert_pref: (appForm.expertPref || "").trim(), at: new Date().toISOString() }));
      await log(app ? "선택컨설팅 신청서 수정" : "선택컨설팅 신청서 제출", `${T.label} · ${(data.field || []).join("/") || data.field_other || ""}`);
    } catch (e2) { say(`저장 실패: ${e2.message}`); return; }
    reload(); setEditApp(false);
    say(app ? "신청서를 수정했습니다." : "신청서를 제출했습니다. 사무국이 전문가와 일시를 배정하면 안내됩니다.");
  };

  const toggle = (d) => setPicks((p) => { if (p.includes(d)) return p.filter((x) => x !== d); if (p.length >= MAX_RANK) { say(`희망 순위는 ${MAX_RANK}개까지 고를 수 있습니다.`); return p; } return [...p, d]; });

  const save = async () => {
    if (!picks.length) { say("희망 일시를 최소 1개 이상 체크해 주세요."); return; }
    const chosen = picks.map((k) => slots.find((x) => slotKey(x) === k)).filter(Boolean);   // 체크 순서 유지
    try {
      await run(sb.from("avail").delete().match({ org_id: me.id, type }));
      await run(sb.from("avail").insert(chosen.map((x, i) => ({ org_id: me.id, type, date: iso(x.date), time: x.time || "", rank: i + 1 }))));
      await log("컨설팅 가능일시 제출", `${T.label} · ${chosen.map((x, i) => `${i + 1}순위 ${slotShort(x)}`).join(", ")}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say("희망 순위를 제출했습니다. 사무국이 매칭을 승인하면 최종 일정이 안내됩니다.");
  };

  const savePre = async () => {
    const e = {};
    if (!form.rate || isNaN(Number(form.rate))) e.rate = "예산 집행률을 숫자로 입력해 주세요.";
    else if (Number(form.rate) < 0 || Number(form.rate) > 100) e.rate = "0에서 100 사이 값을 입력해 주세요.";
    if (!form.progress?.trim()) e.progress = "세부활동별 진행현황은 필수 입력입니다.";
    if (!form.country?.trim()) e.country = "현지 여건 및 주요 이슈는 필수 입력입니다.";
    setErrs(e);
    if (Object.keys(e).length) { say("입력하지 않은 필수 항목이 있습니다."); return; }
    try {
      await run(sb.from("pre").upsert({ org_id: me.id, type, rate: String(form.rate), progress: form.progress, country: form.country, ask: form.ask || "", at: new Date().toISOString() }));
    } catch (e) { say(`저장 실패: ${e.message}`); return; }
    reload(); setEditPre(false);
    say("컨설팅 사전 정보를 저장했습니다. 전문가와 사무국이 열람합니다.");
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub={isApply(T) ? "신청서를 제출하면 사무국이 전문가와 일시를 배정해 안내합니다." : "담당 전문가의 가능 일시 중에서 희망 순위를 골라 주세요. 사무국이 매칭을 승인하면 최종 일정이 확정됩니다."} />

      <div className="tabs">
        {CONSULT_TYPES.map((t) => (
          <div key={t.key} className={`tb ${type === t.key ? "tb-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}{t.required && <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 6 }}>필수</span>}
          </div>
        ))}
      </div>

      {isApply(T) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chd"><h3>{T.label} 신청서</h3>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--ink3)" }}>
              {app ? `제출 ${app.at}` : "작성 후 제출해 주세요"}
              {app && !editApp && <button className="b2 bs" onClick={() => setEditApp(true)}>수정</button>}
            </span></div>
          {!editApp && app ? <div style={{ padding: 18 }}><AppView app={app} /></div> : (
            <div style={{ padding: 18 }}>
              {OPT_FIELDS.map((f) => {
                const v = appForm[f.key];
                const len = typeof v === "string" ? v.length : 0;
                const first = f.key === OPT_FIELDS[0].key;
                return (
                  <div key={f.key} style={{ marginBottom: 14 }}>
                    {f.section && <div style={{ fontSize: 12.5, fontWeight: 700, margin: "6px 0 10px", paddingTop: first ? 0 : 10, borderTop: first ? "none" : "1px solid var(--line2)" }}>{f.section}</div>}
                    <label className="lbl">{f.label}{f.required && <span style={{ color: "var(--redT)" }}> *</span>}
                      {f.max && <span className="mono" style={{ float: "right", color: len > f.max ? "var(--redT)" : "var(--ink3)" }}>{len}/{f.max}</span>}</label>
                    {f.kind === "static" ? <div style={{ padding: "7px 0", fontSize: 13 }}>{me.name}</div>
                    : f.kind === "multi" ? (
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "4px 0" }}>
                          {f.options.map((opt) => {
                            const on = (v || []).includes(opt);
                            return (
                              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
                                <input type="checkbox" style={{ width: "auto" }} checked={on}
                                  onChange={() => setAppForm({ ...appForm, [f.key]: on ? (v || []).filter((x) => x !== opt) : [...(v || []), opt] })} />{opt}
                              </label>
                            );
                          })}
                        </div>
                        {f.other && <input style={{ marginTop: 6 }} className={appErrs[f.key] ? "err" : ""} value={appForm[`${f.key}_other`] || ""}
                          onChange={(e) => setAppForm({ ...appForm, [`${f.key}_other`]: e.target.value })} placeholder="기타 (직접 입력)" />}
                        {appErrs[f.key] && <div className="errmsg">하나 이상 선택하거나 기타에 적어 주세요.</div>}
                      </div>
                    ) : f.kind === "textarea"
                      ? <textarea rows={f.rows || 4} className={appErrs[f.key] ? "err" : ""} value={v || ""} placeholder={f.placeholder} onChange={(e) => setAppForm({ ...appForm, [f.key]: e.target.value })} />
                      : <input type="text" className={appErrs[f.key] ? "err" : ""} value={v || ""} placeholder={f.placeholder} onChange={(e) => setAppForm({ ...appForm, [f.key]: e.target.value })} />}
                    {typeof appErrs[f.key] === "string" && <div className="errmsg">{appErrs[f.key]}로 줄여 주세요.</div>}
                  </div>
                );
              })}
              <div style={{ marginBottom: 16 }}>
                <label className="lbl">희망 컨설턴트</label>
                <input value={appForm.expertPref || ""} onChange={(e) => setAppForm({ ...appForm, expertPref: e.target.value })} placeholder="성함" />
                <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 5 }}>{EXPERT_PREF_HINT}</div>
              </div>
              <button className="b1" onClick={saveApp}>{app ? "수정 저장" : "신청서 제출"}</button>
              {app && <button className="b2" style={{ marginLeft: 8 }} onClick={() => { setAppForm(blankApp(app)); setEditApp(false); }}>취소</button>}
            </div>
          )}
        </div>
      )}

      {cf ? (
        <div className="card" style={{ padding: 22, marginBottom: 16, background: "var(--green)", borderColor: "#C6E3D2" }}>
          <div style={{ fontSize: 11.5, color: "var(--greenT)" }}>{T.label} 일정이 확정되었습니다</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--greenT)", marginTop: 4 }}>
            {slotLong(cf)}
          </div>
          <div style={{ fontSize: 12, color: "var(--greenT)", marginTop: 6 }}>
            1회 {durOf(T)}분 · 온라인{expertName(db, cf) && <> · 담당 전문가 {expertName(db, cf)}</>} · {cf.zoom
              ? <>Zoom 링크 <a href={cf.zoom} target="_blank" rel="noreferrer" style={{ color: "var(--greenT)" }}>{cf.zoom}</a></>
              : "Zoom 링크는 확정 후 담당자 이메일로 발송됩니다."}
          </div>
        </div>
      ) : isApply(T) ? (
        app && <div className="card note" style={{ background: "var(--blue)", color: "var(--blueT)", marginBottom: 16 }}>신청서가 접수되었습니다. 사무국이 전문가와 일시를 배정하면 이곳에 확정 일정이 표시됩니다.</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>{T.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{periodOf(T)}</span></h3>
              <span className="bg g-rev" style={{ fontSize: 10.5 }}>희망 순서대로 최대 {MAX_RANK}개 체크</span></div>
            <div style={{ display: "flex", gap: 10, padding: 16, flexWrap: "wrap" }}>
              {slots.length === 0 && <div style={{ fontSize: 12, color: "var(--ink3)" }}>
                {!open ? (openAtOf(T) ? `${openAtLabel(T)}부터 컨설팅 일자 선택이 가능합니다.` : "사무국이 전문가 일정을 조율하고 있습니다. 선택 가능 일시가 정해지면 이곳에 안내됩니다.")
                  : !myExpert ? "담당 전문가가 아직 배정되지 않았습니다. 사무국에 문의해 주세요."
                  : "담당 전문가의 가능 일시가 아직 등록되지 않았습니다."}</div>}
              {[...new Set(slots.map((x) => x.date))].map((d) => (
                <div key={d} style={{ flex: "1 1 150px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{Number(d.slice(5, 7))}월 {Number(d.slice(8))}일</div>
                  {slots.filter((x) => x.date === d).map((x) => {
                    const k = slotKey(x);
                    const full = taken(x);
                    const on = picks.includes(k);
                    return (
                      <div key={k} className={`dsel ${on ? "dsel-on" : ""} ${full ? "dsel-full" : ""}`}
                        style={{ marginBottom: 6, padding: "8px 10px" }} onClick={() => !full && toggle(k)}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{timeRange(x) || "종일"}</div>
                        <div style={{ fontSize: 10.5 }}>{full ? "타 기관 컨설팅 일정 선점" : on ? `${picks.indexOf(k) + 1}순위 ✓` : "선택"}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: "0 16px 14px", fontSize: 11.5, color: "var(--ink2s)" }}>
              체크한 순서가 1·2·3순위로 사무국에 전달됩니다. 담당 전문가{myExpert ? ` ${myExpert.name}` : ""}의 가능 일시만 표시되며, 같은 전문가를 공유하는 다른 기관이 선점한 일시는 선택할 수 없습니다.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <button className="b1" onClick={save} disabled={!open || !slots.length}>가능 일시 제출</button>
            <span style={{ fontSize: 11.5, color: "var(--ink2s)" }}>
              {picks.length}개 선택됨{mine.length ? " · 기존 제출 내역을 덮어씁니다" : ""}</span>
          </div>
        </>
      )}

      {!isApply(T) && <div className="card">
        <div className="chd"><h3>{T.label} 사전 정보</h3>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--ink3)" }}>
            {savedPre ? `최근 저장 ${savedPre.at}` : "컨설팅 전 미리 작성해 주세요 · 회차마다 따로 작성합니다"}
            {!editPre && <button className="b2 bs" onClick={() => { setForm(savedPre); setEditPre(true); }}>수정</button>}
          </span></div>
        {!editPre ? (
          <div style={{ padding: 18 }}>
            {[["1. 예산 집행률", `${pre.rate}%`], ["2. 세부활동별 사업 진행현황", pre.progress], ["3. 사업대상국 현지 여건 및 주요 이슈", pre.country], ["4. 전문가 자문 요청사항", pre.ask]].map(([l, v]) => (
              <div key={l} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{l}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{v || "—"}</div>
              </div>
            ))}
          </div>
        ) : (
        <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl">1. 예산 집행률 — 연간 총 예산 대비 집행률 (%)</label>
            <input className={errs.rate ? "err" : ""} style={{ width: 160 }} value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="예: 62" />
            {errs.rate && <div className="errmsg">{errs.rate}</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl">2. 세부활동별 사업 진행현황 — 사업계획 대비 진행현황을 간략히</label>
            <textarea rows={3} className={errs.progress ? "err" : ""} value={form.progress}
              onChange={(e) => setForm({ ...form, progress: e.target.value })}
              placeholder="예: 3/2(화) 교사교육 참가자 모집 완료 00명 / 지역 농민 참가자 모집 진행 중 00명 접수" />
            {errs.progress && <div className="errmsg">{errs.progress}</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl">3. 사업대상국 현지 여건 및 주요 이슈 — 정치·사회 정세, 치안·기후 등</label>
            <textarea rows={3} className={errs.country ? "err" : ""} value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="사업 수행에 직·간접적 영향을 미치는 현지 이슈를 적어 주세요." />
            {errs.country && <div className="errmsg">{errs.country}</div>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="lbl">4. 전문가 자문 요청사항 — 사업·성과 관리, 대상자 모집·관리, 이해관계자 소통 등</label>
            <textarea rows={3} value={form.ask} onChange={(e) => setForm({ ...form, ask: e.target.value })}
              placeholder="컨설팅에서 다루고 싶은 고민점을 적어 주세요." />
          </div>
          <button className="b1" onClick={savePre}>사전 정보 저장</button>
          {savedPre && <button className="b2" style={{ marginLeft: 8 }} onClick={() => setEditPre(false)}>취소</button>}
        </div>
        )}
      </div>}
    </div>
  );
}

/* ═══════════ 예산변경 / 사업변경 — 기관 ═══════════ */

function OrgBudget({ db, reload, say, log, me }) {
  const [tab, setTab] = useState("inner");
  const o = orgOf(me.id);
  const rows = db.budgets[me.id] || [];
  const myDocs = db.docs.filter((d) => d.orgId === me.id);
  const cumIn = absSum(rows), cumEx = extSum(myDocs), cum = cumIn + cumEx;
  const limit = o.budgetYear ? Math.floor(o.budgetYear * CHANGE_LIMIT) : 0;
  const pct = (n) => o.budgetYear ? (n / o.budgetYear) * 100 : 0;

  const blank = () => ({ level: "세세목", item: "", itemTo: "", beforeBasis: "", beforeAmt: "", afterBasis: "", afterAmt: "", reason: "" });
  const nextRound = rows.length ? Math.max(...rows.map((r) => Number(r.round) || 0)) + 1 : 1;
  const [h, setH] = useState({ round: String(nextRound), date: "", docNo: "", newItem: false, cross: false, plan: false });
  const [items, setItems] = useState([blank()]);
  const [errs, setErrs] = useState({});
  const upItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const diffOf = (x) => (Number(x.afterAmt) || 0) - (Number(x.beforeAmt) || 0);
  const newAbs = items.reduce((a, x) => a + Math.abs(diffOf(x)), 0);
  const projIn = cumIn + newAbs;            // 내부 누적 (1천만원 승인 기준)
  const projAll = cum + newAbs;             // 내부 + 외부 누적 (20% 한도 기준)
  const over20 = !!o.budgetYear && projAll > limit;

  const triggers = [];
  if (projIn > APPROVAL_THRESHOLD) triggers.push(`내부 예산변경 누적금액이 1천만원을 초과합니다 (${won(projIn)}원)`);
  if (h.cross) triggers.push("목(세목) 간 전용이 발생합니다");
  if (h.newItem) triggers.push("신규 세목·세세목이 추가됩니다");
  if (h.plan) triggers.push("국내/현지 예산계획 자체가 변경됩니다");

  const add = async () => {
    const e = {};
    if (!h.round) e.round = "차수";
    if (!h.date) e.date = "내부 변경일";
    if (!h.docNo.trim()) e.docNo = "문서번호";
    items.forEach((x, i) => {
      if (!x.item.trim()) e[`item${i}`] = 1;
      if (x.beforeAmt === "" || isNaN(Number(x.beforeAmt))) e[`before${i}`] = 1;
      if (x.afterAmt === "" || isNaN(Number(x.afterAmt))) e[`after${i}`] = 1;
      if (!x.reason.trim()) e[`reason${i}`] = 1;
    });
    setErrs(e);
    if (Object.keys(e).length) { say("입력하지 않은 필수 항목이 있습니다."); return; }
    if (over20) { say(`당해년도 사업예산의 ${CHANGE_LIMIT * 100}%를 초과하는 변경은 등록할 수 없습니다.`); return; }
    if (triggers.length) { say("승인이 필요한 변경입니다. 아래 안내를 확인하고 승인 문서를 제출해 주세요."); return; }
    try {
      await run(sb.from("budgets").insert(items.map((x) => ({ org_id: me.id, round: Number(h.round), date: h.date, doc_no: h.docNo.trim(), level: x.level,
        item: x.item.trim(), item_to: x.itemTo.trim(), before_basis: x.beforeBasis, before_amt: Number(x.beforeAmt), after_basis: x.afterBasis, after_amt: Number(x.afterAmt),
        reason: x.reason.trim(), new_item: h.newItem, cross_item: h.cross, plan: h.plan }))));
      await log("내부 예산변경 등록", `${h.round}차 · ${items.length}건 · ${won(newAbs)}원`);
    } catch (e2) { say(`저장 실패: ${e2.message}`); return; }
    reload();
    setH({ round: String(Number(h.round) + 1), date: "", docNo: "", newItem: false, cross: false, plan: false });
    setItems([blank()]);
    say(`${h.round}차 내부 예산변경 ${items.length}건을 등록했습니다.`);
  };

  const del = (id) => run(sb.from("budgets").delete().eq("id", id)).then(reload).catch((e) => say(`삭제 실패: ${e.message}`));

  const upload = async (kind, files, reason, amount) => {
    if (kind === "budget" && o.budgetYear && cum + amount > limit) {
      say(`이 변경을 더하면 누적 변경액이 당해년도 예산의 ${CHANGE_LIMIT * 100}%를 초과합니다 (한도 ${won(limit)}원).`); throw new Error("limit");
    }
    try {
      const [f0] = await uploadFiles(`org-${me.id}/docs`, files);
      await run(sb.from("docs").insert({ org_id: me.id, kind, name: f0.n, size: f0.s, path: f0.path, reason, amount: kind === "budget" ? amount : 0 }));
      await log(kind === "budget" ? "예산변경 승인 신청" : "사업변경 승인 신청", f0.n);
    } catch (e) { say(`제출 실패: ${e.message}`); throw e; }
    reload();
    say("승인 신청 문서를 제출했습니다. 사무국 검토 후 결과가 안내됩니다.");
  };

  const Stat = ({ l, v, sub, warn }) => (
    <div style={{ flex: 1, padding: "0 16px", borderLeft: "1px solid var(--line2)" }}>
      <div style={{ fontSize: 11, color: "var(--ink2s)" }}>{l}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: warn ? "var(--redT)" : "var(--ink)" }}>{v}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <PageHead title="예산변경 / 사업변경" sub="기관 내부 변경은 직접 입력하고, 승인이 필요한 변경은 문서로 제출합니다." />

      <div className="card stats" style={{ display: "flex", padding: "14px 0", marginBottom: 14 }}>
        <Stat l="3개년 사업예산 총액" v={o.budgetTotal ? `${won(o.budgetTotal)}원` : "—"} sub="사무국 등록" />
        <Stat l={`${o.year}차년도 사업예산 총액`} v={o.budgetYear ? `${won(o.budgetYear)}원` : "—"} sub="사무국 등록" />
        <Stat l="누적 변경액 (내부 + 승인 문서)" v={`${won(cum)}원`} sub={`내부 ${won(cumIn)} · 문서 ${won(cumEx)}`} warn={over20 && cum > limit} />
        <Stat l={`누적 변경 비율 (한도 ${CHANGE_LIMIT * 100}%)`} v={o.budgetYear ? `${pct(cum).toFixed(1)}%` : "—"}
          sub={o.budgetYear ? `한도 ${won(limit)}원 · 잔여 ${won(Math.max(0, limit - cum))}원` : "당해년도 예산이 등록되면 계산됩니다"} warn={cum > limit && !!o.budgetYear} />
      </div>

      <div className="tabs">
        <div className={`tb ${tab === "inner" ? "tb-on" : ""}`} onClick={() => setTab("inner")}>기관 내부 예산변경</div>
        <div className={`tb ${tab === "doc" ? "tb-on" : ""}`} onClick={() => setTab("doc")}>
          승인 예산변경 / 사업변경
          {myDocs.filter((d) => d.status === "pending").length > 0 &&
            <span className="bg g-sub" style={{ fontSize: 9.5, marginLeft: 6 }}>
              {myDocs.filter((d) => d.status === "pending").length}건 대기</span>}
        </div>
      </div>

      {tab === "inner" ? (
        <>
          <div className="card note" style={{ background: "var(--blue)", color: "#2A4C82", marginBottom: 14 }}>
            내부 결재로 처리하는 예산변경입니다. 사무국 승인 없이 기관이 직접 입력합니다.
            누적금액은 증감의 부호와 관계없이 변경된 금액의 절댓값을 더해 계산하며, 승인 문서로 제출한 변경액과 합쳐 당해년도 예산의 {CHANGE_LIMIT * 100}%를 넘을 수 없습니다.
          </div>

          <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
            <div className="chd"><h3>내부 예산변경 내역</h3>
              <span style={{ fontSize: 11.5 }}>내부 누적 <b className="mono" style={{ color: cumIn > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>
                {won(cumIn)}</b>원 / 1천만원</span></div>
            <table style={{ minWidth: 960 }}>
              <thead><tr><th>차수</th><th>내부 변경일</th><th>문서번호</th><th>구분 · 항목</th><th>변경 전</th><th>변경 후</th>
                <th style={{ textAlign: "right" }}>증감내역</th><th style={{ textAlign: "right" }}>누적금액</th><th>사유</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const d2 = Number(r.afterAmt) - Number(r.beforeAmt);
                  const running = absSum(rows.slice(0, i + 1));
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.round}차</td>
                      <td className="mono" style={{ color: "var(--ink2s)" }}>{r.date}</td>
                      <td className="mono" style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{r.docNo}</td>
                      <td><span className="bg g-not">{r.level}</span>
                        <div style={{ fontSize: 11, color: "var(--ink2s)", marginTop: 3 }}>{r.item}{r.itemTo && <> <b>→</b> {r.itemTo}</>}</div></td>
                      <td style={{ fontSize: 11.5 }}>{r.beforeBasis}
                        <div className="mono" style={{ color: "var(--ink2s)" }}>{won(r.beforeAmt)}원</div></td>
                      <td style={{ fontSize: 11.5 }}>{r.afterBasis}
                        <div className="mono" style={{ color: "var(--ink2s)" }}>{won(r.afterAmt)}원</div></td>
                      <td className="mono" style={{ textAlign: "right", color: d2 > 0 ? "var(--greenT)" : d2 < 0 ? "var(--redT)" : "var(--ink3)" }}>
                        {d2 > 0 ? "+" : ""}{won(d2)}</td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--ink2s)" }}>{won(running)}</td>
                      <td style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{r.reason}</td>
                      <td><button className="b2 bs" onClick={() => del(r.id)}>삭제</button></td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>
                  등록된 내부 예산변경 내역이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 13.5 }}>내역 추가</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 80 }}><label className="lbl">차수</label>
                <input className={errs.round ? "err" : ""} value={h.round} onChange={(e) => setH({ ...h, round: e.target.value.replace(/[^0-9]/g, "") })} /></div>
              <div style={{ width: 170 }}><label className="lbl">내부 변경일</label>
                <input type="date" className={errs.date ? "err" : ""} value={h.date ? iso(h.date) : ""} onChange={(e) => setH({ ...h, date: fmt(e.target.value) })} /></div>
              <div style={{ width: 180 }}><label className="lbl">문서번호 (내부기안)</label>
                <input className={errs.docNo ? "err" : ""} value={h.docNo} onChange={(e) => setH({ ...h, docNo: e.target.value })} placeholder="기관-2027-052" /></div>
              <div style={{ flex: 1, display: "flex", gap: 16, alignItems: "flex-end", paddingBottom: 6, fontSize: 12 }}>
                {[["cross", "목(세목) 간 전용"], ["newItem", "신규 세목·세세목 추가"], ["plan", "국내/현지 예산계획 변경"]].map(([k, l]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={h[k]} onChange={(e) => setH({ ...h, [k]: e.target.checked })} />{l}
                  </label>
                ))}
              </div>
            </div>

            {items.map((x, i) => {
              const d = diffOf(x);
              return (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 10, background: "#FCFDFF" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <b style={{ fontSize: 12 }}>항목 {i + 1}</b>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                      <span>증감 <b className="mono" style={{ color: d > 0 ? "var(--greenT)" : d < 0 ? "var(--redT)" : "var(--ink3)" }}>{d > 0 ? "+" : ""}{won(d)}원</b></span>
                      {items.length > 1 && <button className="b2 bs" onClick={() => setItems(items.filter((_, j) => j !== i))}>항목 삭제</button>}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 100 }}><label className="lbl">구분</label>
                      <select value={x.level} onChange={(e) => upItem(i, { level: e.target.value })}>
                        {BUDGET_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label className="lbl">변경 전 항목</label>
                      <input className={errs[`item${i}`] ? "err" : ""} value={x.item} onChange={(e) => upItem(i, { item: e.target.value })} placeholder="사업비 > 교육운영비 > 강사비" /></div>
                    <div style={{ alignSelf: "flex-end", paddingBottom: 8, color: "var(--ink3)" }}>→</div>
                    <div style={{ flex: 1 }}><label className="lbl">변경 후 항목 (전용 시 · 같은 항목이면 비워두기)</label>
                      <input value={x.itemTo} onChange={(e) => upItem(i, { itemTo: e.target.value })} placeholder="사업비 > 교육운영비 > 다과비" /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}><label className="lbl">변경 전 산출근거</label>
                      <input value={x.beforeBasis} onChange={(e) => upItem(i, { beforeBasis: e.target.value })} placeholder="50,000원 × 20회" /></div>
                    <div style={{ width: 140 }}><label className="lbl">변경 전 금액</label>
                      <MoneyInput className={errs[`before${i}`] ? "err" : ""} value={x.beforeAmt} onChange={(v) => upItem(i, { beforeAmt: v })} placeholder="1,000,000" /></div>
                    <div style={{ flex: 1 }}><label className="lbl">변경 후 산출근거</label>
                      <input value={x.afterBasis} onChange={(e) => upItem(i, { afterBasis: e.target.value })} placeholder="50,000원 × 26회" /></div>
                    <div style={{ width: 140 }}><label className="lbl">변경 후 금액</label>
                      <MoneyInput className={errs[`after${i}`] ? "err" : ""} value={x.afterAmt} onChange={(v) => upItem(i, { afterAmt: v })} placeholder="1,300,000" /></div>
                  </div>
                  <div><label className="lbl">변경 사유</label>
                    <input className={errs[`reason${i}`] ? "err" : ""} value={x.reason} onChange={(e) => upItem(i, { reason: e.target.value })} placeholder="교육 회차 확대에 따른 강사료 증액" /></div>
                </div>
              );
            })}
            <button className="b2 bs" style={{ marginBottom: 12 }} onClick={() => setItems([...items, blank()])}>+ 같은 차수에 항목 추가</button>

            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 12px", background: "#FAFBFE", borderRadius: 6, marginBottom: 10, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: "var(--ink2s)" }}>자동 계산</span>
              <span>이번 차수 변경액 <b className="mono">{won(newAbs)}원</b></span>
              <span>내부 누적 <b className="mono" style={{ color: projIn > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>{won(projIn)}원</b></span>
              <span>내부 + 문서 누적 <b className="mono" style={{ color: over20 ? "var(--redT)" : "var(--ink)" }}>{won(projAll)}원</b>
                {o.budgetYear ? <> ({pct(projAll).toFixed(1)}%)</> : null}</span>
            </div>

            {over20 && (
              <div className="note" style={{ background: "var(--red)", color: "var(--redT)", marginBottom: 12 }}>
                <b>등록할 수 없습니다.</b> 내부 변경과 승인 문서 변경을 합친 누적액이 당해년도 사업예산의 {CHANGE_LIMIT * 100}%(한도 {won(limit)}원)를 초과합니다.
              </div>
            )}
            {!over20 && triggers.length > 0 && (
              <div className="note" style={{ background: "var(--red)", color: "var(--redT)", marginBottom: 12 }}>
                <b>승인 대상 변경입니다 — 내부 예산변경으로 처리할 수 없습니다.</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {triggers.map((t) => <li key={t}>{t}</li>)}
                </ul>
                <div style={{ marginTop: 8 }}>
                  <button className="b2 bs" onClick={() => setTab("doc")}>승인 문서 제출로 이동 →</button>
                </div>
              </div>
            )}

            <button className="b1" onClick={add} disabled={over20 || triggers.length > 0}>{items.length}건 내역 추가</button>
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>제출 문서</h3></div>
            <table>
              <thead><tr><th>구분</th><th>문서</th><th>변경 사유</th><th style={{ textAlign: "right" }}>변경 금액</th><th>제출일</th><th>상태</th></tr></thead>
              <tbody>
                {myDocs.map((d) => (
                  <tr key={d.id}>
                    <td><span className="bg g-sub">{d.kind === "budget" ? "예산변경" : "사업변경"}</span></td>
                    <td>{d.name}<span className="mono" style={{ color: "var(--ink3)", marginLeft: 7 }}>{mb(d.size)}</span></td>
                    <td style={{ color: "var(--ink2s)" }}>{d.reason}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{d.kind === "budget" ? `${won(d.amount)}원` : "—"}</td>
                    <td className="mono" style={{ color: "var(--ink3)" }}>{d.at}</td>
                    <td>{d.status === "approved"
                      ? <><span className="bg g-app">승인</span>
                        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 3 }}>{d.approvedAt} · {d.by}</div></>
                      : <span className="bg g-req">승인 대기</span>}</td>
                  </tr>
                ))}
                {!myDocs.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>
                  제출한 문서가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <DocUpload onUpload={upload} />
        </>
      )}
    </div>
  );
}

function DocUpload({ onUpload }) {
  const [kind, setKind] = useState("budget");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13.5 }}>승인 신청 문서 제출</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 150 }}><label className="lbl">구분</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="budget">예산변경</option><option value="project">사업변경</option></select></div>
        {kind === "budget" && <div style={{ width: 170 }}><label className="lbl">변경 금액 (원, 절댓값)</label>
          <MoneyInput className={err === "amount" ? "err" : ""} value={amount} onChange={setAmount} placeholder="3,200,000" /></div>}
        <div style={{ flex: 1 }}><label className="lbl">변경 사유 (요약)</label>
          <input className={err === "reason" ? "err" : ""} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="목 간 전용 발생 (사업비 → 인건비 3,200,000원)" />
          {err && <div className="errmsg">{err === "amount" ? "변경 금액을 입력해 주세요." : "변경 사유를 입력해 주세요."}</div>}</div>
      </div>
      <Uploader label="승인 신청 제출"
        onDone={async (files) => {
          if (!reason.trim()) { setErr("reason"); throw new Error("reason"); }
          if (kind === "budget" && !Number(amount)) { setErr("amount"); throw new Error("amount"); }
          setErr(""); await onUpload(kind, files, reason.trim(), Number(amount) || 0); setReason(""); setAmount("");
        }} />
    </div>
  );
}

/* ═══════════ 예산변경 / 사업변경 — 관리자 ═══════════ */

function AdminBudget({ db, reload, say, log, who }) {
  const [tab, setTab] = useState("pending");
  const list = db.docs.filter((d) => tab === "pending" ? d.status === "pending" : d.status === "approved");
  const [memo, setMemo] = useState({});
  const [bud, setBud] = useState({});   // {orgId: {total, year}} 편집 중인 값

  const approve = async (doc) => {
    try {
      await run(sb.from("docs").update({ status: "approved", approved_by: who, approved_at: new Date().toISOString(), memo: memo[doc.id] || "" }).eq("id", doc.id));
      await run(sb.from("alerts").insert({ org_id: doc.orgId, text: `${doc.kind === "budget" ? "예산변경" : "사업변경"} 신청 문서가 승인 처리되었습니다.` }));
      await log(doc.kind === "budget" ? "예산변경 승인" : "사업변경 승인", `${orgOf(doc.orgId).name} · ${doc.name}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say(`승인 처리했습니다. ${orgOf(doc.orgId).name}에 알림이 전달됩니다.`);
  };

  const saveBudget = async (o) => {
    const v = bud[o.id]; if (!v) return;
    try {
      await run(sb.from("orgs").update({ budget_total: Number(v.total) || 0, budget_year: Number(v.year) || 0 }).eq("id", o.id));
      await log("사업예산 총액 등록", `${o.name} · 3개년 ${won(v.total)} · 당해년도 ${won(v.year)}`);
    } catch (e) { say(`저장 실패: ${e.message}`); return; }
    setBud({ ...bud, [o.id]: undefined }); reload(); say(`${o.name} 예산 총액을 저장했습니다.`);
  };

  const status = db.orgList.map((o) => {
    const inn = absSum(db.budgets[o.id] || []), ex = extSum(db.docs.filter((d) => d.orgId === o.id));
    const limit = Math.floor(o.budgetYear * CHANGE_LIMIT);
    return { o, n: (db.budgets[o.id] || []).length, inn, ex, sum: inn + ex, limit, pct: o.budgetYear ? ((inn + ex) / o.budgetYear) * 100 : null };
  });

  return (
    <div>
      <PageHead title="예산변경 / 사업변경" sub="기관이 제출한 승인 신청 문서를 검토하고, 기관별 사업예산 총액과 변경 현황을 관리하세요." />

      <div className="tabs">
        <div className={`tb ${tab === "pending" ? "tb-on" : ""}`} onClick={() => setTab("pending")}>
          승인 대기 <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 5 }}>
            {db.docs.filter((d) => d.status === "pending").length}</span></div>
        <div className={`tb ${tab === "done" ? "tb-on" : ""}`} onClick={() => setTab("done")}>승인 완료</div>
        <div className={`tb ${tab === "inner" ? "tb-on" : ""}`} onClick={() => setTab("inner")}>기관별 변경 현황</div>
        <div className={`tb ${tab === "budget" ? "tb-on" : ""}`} onClick={() => setTab("budget")}>기관 예산 총액</div>
      </div>

      {tab === "budget" ? (
        <div className="card">
          <div className="chd"><h3>기관별 사업예산 총액</h3>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>기관 화면에 표시되며 변경 한도({CHANGE_LIMIT * 100}%) 계산 기준이 됩니다</span></div>
          <table>
            <thead><tr><th>기관</th><th style={{ width: 90 }}>차년도</th><th style={{ width: 220 }}>3개년 사업예산 총액 (원)</th><th style={{ width: 220 }}>당해년도 사업예산 총액 (원)</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>
              {db.orgList.map((o) => {
                const v = bud[o.id] || { total: String(o.budgetTotal || ""), year: String(o.budgetYear || "") };
                const dirty = !!bud[o.id];
                return (
                  <tr key={o.id}>
                    <td><b style={{ fontWeight: 500 }}>{o.name}</b></td>
                    <td className="mono">{o.year}차년도</td>
                    <td><MoneyInput value={v.total} onChange={(n) => setBud({ ...bud, [o.id]: { ...v, total: n } })} /></td>
                    <td><MoneyInput value={v.year} onChange={(n) => setBud({ ...bud, [o.id]: { ...v, year: n } })} /></td>
                    <td style={{ textAlign: "right" }}><button className={dirty ? "b1 bs" : "b2 bs"} disabled={!dirty} onClick={() => saveBudget(o)}>저장</button></td>
                  </tr>
                );
              })}
              {!db.orgList.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>등록된 기관이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : tab === "inner" ? (
        <div className="card">
          <div className="chd"><h3>기관별 예산변경 누적 현황</h3>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>내부 1천만원 초과 시 승인 대상 · 내부+문서 합산 {CHANGE_LIMIT * 100}% 한도</span></div>
          <table>
            <thead><tr><th>기관</th><th style={{ textAlign: "right" }}>당해년도 예산</th><th>내부 건수</th><th style={{ textAlign: "right" }}>내부 누적</th>
              <th style={{ textAlign: "right" }}>승인 문서 누적</th><th style={{ textAlign: "right" }}>합산</th><th style={{ textAlign: "right" }}>비율</th><th>비고</th></tr></thead>
            <tbody>
              {status.map(({ o, n, inn, ex, sum, limit, pct }) => (
                <tr key={o.id}>
                  <td><b style={{ fontWeight: 500 }}>{o.name}</b></td>
                  <td className="mono" style={{ textAlign: "right", color: o.budgetYear ? "var(--ink)" : "var(--ink3)" }}>{o.budgetYear ? `${won(o.budgetYear)}원` : "미등록"}</td>
                  <td className="mono">{n}건</td>
                  <td className="mono" style={{ textAlign: "right", color: inn > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>{won(inn)}원</td>
                  <td className="mono" style={{ textAlign: "right" }}>{won(ex)}원</td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{won(sum)}원</td>
                  <td className="mono" style={{ textAlign: "right", color: pct !== null && sum > limit ? "var(--redT)" : "var(--ink)" }}>{pct === null ? "—" : `${pct.toFixed(1)}%`}</td>
                  <td>{pct !== null && sum > limit ? <span className="bg g-red">{CHANGE_LIMIT * 100}% 초과</span>
                    : inn > APPROVAL_THRESHOLD ? <span className="bg g-req">내부 1천만원 초과</span>
                    : <span className="bg g-not">한도 내</span>}</td>
                </tr>
              ))}
              {!status.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>등록된 기관이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {list.map((d) => (
            <div key={d.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b style={{ fontSize: 14 }}>{orgOf(d.orgId).name}</b>
                    <span className="bg g-sub">{d.kind === "budget" ? "예산변경" : "사업변경"}</span>
                    {d.kind === "budget" && <span className="mono" style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{won(d.amount)}원</span>}
                    {d.status === "approved" && <span className="bg g-app">승인 완료</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink2s)", marginTop: 4 }}>{d.reason}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>제출 {d.at}</div>
                  {d.status === "approved" && <div className="mono" style={{ fontSize: 11, color: "var(--greenT)" }}>
                    승인 {d.approvedAt} · {d.by}</div>}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: "#FAFBFE", border: "1px solid var(--line2)", borderRadius: 6, marginTop: 12 }}>
                <span style={{ fontSize: 12 }}>{d.name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{mb(d.size)}</span>
                  <button className="b2 bs" onClick={() => { log("문서 다운로드", `${orgOf(d.orgId).name} · ${d.name}`); download(d.path, d.name).catch(() => say("파일을 찾을 수 없습니다.")); }}>
                    다운로드 ↓</button>
                </span>
              </div>

              {d.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input placeholder="승인 메모 (선택)" value={memo[d.id] || ""}
                    onChange={(e) => setMemo({ ...memo, [d.id]: e.target.value })} />
                  <button className="b1" onClick={() => approve(d)}>승인</button>
                </div>
              )}
            </div>
          ))}
          {!list.length && <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink3)" }}>
            {tab === "pending" ? "승인 대기 중인 문서가 없습니다." : "승인 완료된 문서가 없습니다."}</div>}
        </div>
      )}
    </div>
  );
}

/* ═══════════ 전문가 화면 ═══════════ */

function ExpertSubmit({ db, reload, say, log, me }) {
  const [type, setType] = useState("r2");
  const [orgId, setOrgId] = useState(db.orgList[0]?.id);
  const T = EXPERT_REPORTS.find((r) => r.key === type);
  const mine = db.reports.filter((r) => r.expertId === me.id);

  const submit = async (files) => {
    try {
      const [f0] = await uploadFiles(`expert-${me.id}/${type}`, files);
      await run(sb.from("reports").insert({ expert_id: me.id, type, org_id: orgId, name: f0.n, size: f0.s, path: f0.path }));
      await log("보고서 제출", `${orgOf(orgId).name} · ${T.label}`);
    } catch (e) { say(`제출 실패: ${e.message}`); throw e; }
    reload();
    say("보고서를 제출했습니다. 사무국에 알림이 전달됩니다.");
  };

  return (
    <div>
      <PageHead title="자료 제출" sub={`${me.name} ${me.title} · 컨설팅 및 현장점검 보고서를 제출합니다.`} />

      <div className="tabs">
        {EXPERT_REPORTS.map((r) => (
          <div key={r.key} className={`tb ${type === r.key ? "tb-on" : ""}`} onClick={() => setType(r.key)}>{r.label}</div>
        ))}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{T.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 2 }}>제출 마감 {T.due}</div>
          </div>
          <span className="bg g-rev" style={{ fontSize: 10.5 }}>전문가 제출용</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="lbl">대상 기관</label>
          <select style={{ width: 240 }} value={orgId} onChange={(e) => setOrgId(Number(e.target.value))}>
            {db.orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <Uploader label="보고서 제출" onDone={submit} />
      </div>

      <div className="card">
        <div className="chd"><h3>내 제출 이력</h3><span style={{ fontSize: 11, color: "var(--ink3)" }}>{mine.length}건</span></div>
        <table>
          <thead><tr><th>보고서</th><th>대상 기관</th><th>파일</th><th>제출일</th></tr></thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id}>
                <td>{EXPERT_REPORTS.find((x) => x.key === r.type).label}</td>
                <td><b style={{ fontWeight: 500 }}>{orgOf(r.orgId).name}</b></td>
                <td>{r.name}<span className="mono" style={{ color: "var(--ink3)", marginLeft: 7 }}>{mb(r.size)}</span></td>
                <td className="mono" style={{ color: "var(--ink3)" }}>{r.at}</td>
              </tr>
            ))}
            {!mine.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>
              제출한 보고서가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpertConsult({ db, reload, say, log, me }) {
  // 본인이 담당 전문가로 배정된 확정 일정만 (RLS 도 동일하게 제한)
  const rows = db.confirms.filter((c) => c.expertId === me.id).sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  const myOrgIds = new Set(rows.map((c) => c.orgId));

  // ── 가능 일시 조사: 사무국이 등록한 후보 일시 중 가능한 일시를 체크 ──
  const [type, setType] = useState(CONSULT_TYPES[0]?.key);
  const T = CONSULT_TYPES.find((t) => t.key === type);
  const slots = T ? expandSlots(T) : [];
  const mine = db.expertAvail.filter((a) => a.expertId === me.id && a.type === type).map(slotKey);
  const [picks, setPicks] = useState(mine);
  useEffect(() => { setPicks(db.expertAvail.filter((a) => a.expertId === me.id && a.type === type).map(slotKey)); }, [type, db]);
  const toggle = (k) => setPicks((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);
  const savedNote = db.expertNotes.find((n) => n.expertId === me.id && n.type === type)?.note || "";
  const [note, setNote] = useState(savedNote);
  useEffect(() => { setNote(db.expertNotes.find((n) => n.expertId === me.id && n.type === type)?.note || ""); }, [type, db]);

  const save = async () => {
    if (!picks.length && !note.trim()) { say("가능한 일시를 체크하거나 추가 가능 시간을 적어 주세요."); return; }
    const chosen = slots.filter((x) => picks.includes(slotKey(x)));
    try {
      await run(sb.from("expert_avail").delete().match({ expert_id: me.id, type }));
      if (chosen.length) await run(sb.from("expert_avail").insert(chosen.map((x) => ({ expert_id: me.id, type, date: iso(x.date), time: x.time || "" }))));
      await run(sb.from("expert_notes").upsert({ expert_id: me.id, type, note: note.trim(), at: new Date().toISOString() }));
      await log("전문가 가능일시 제출", `${T.label} · ${chosen.map(slotShort).join(", ")}${note.trim() ? " · 추가 의견 있음" : ""}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say("가능 일시를 제출했습니다. 사무국이 확인 후 기관 접수를 시작합니다.");
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub="먼저 가능한 일시를 체크해 주세요. 사무국이 기관 신청을 받아 확정한 최종 일정은 아래에 표시됩니다." />

      <div className="tabs">
        {CONSULT_TYPES.map((t) => (
          <div key={t.key} className={`tb ${type === t.key ? "tb-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}{t.required && <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 6 }}>필수</span>}
          </div>
        ))}
      </div>

      {T && isApply(T) && (
        <div className="card note" style={{ background: "var(--blue)", color: "var(--blueT)", marginBottom: 16 }}>
          {T.label}은 기관이 신청서를 제출하면 사무국이 전문가와 일시를 직접 배정합니다. 배정되면 아래 확정 일정과 신청서 내용이 표시됩니다.
        </div>
      )}
      {T && !isApply(T) && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>{T.label} 가능 일시 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{periodOf(T)}</span></h3>
              {isOpen(T)
                ? <span className="bg g-app" style={{ fontSize: 10.5 }}>기관 접수 중 · 변경 시 사무국에 알려 주세요</span>
                : <span className="bg g-rev" style={{ fontSize: 10.5 }}>가능한 시간대를 모두 체크 · 1건 {durOf(T)}분</span>}</div>
            <div style={{ display: "flex", gap: 10, padding: 16, flexWrap: "wrap" }}>
              {slots.length === 0 && <div style={{ fontSize: 12, color: "var(--ink3)" }}>아직 후보 일시가 없습니다. 사무국이 일정을 등록하면 표시됩니다.</div>}
              {[...new Set(slots.map((x) => x.date))].map((d) => (
                <div key={d} style={{ flex: "1 1 150px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{Number(d.slice(5, 7))}월 {Number(d.slice(8))}일</div>
                  {slots.filter((x) => x.date === d).map((x) => {
                    const k = slotKey(x); const on = picks.includes(k);
                    return (
                      <div key={k} className={`dsel ${on ? "dsel-on" : ""}`} style={{ marginBottom: 6, padding: "8px 10px" }} onClick={() => toggle(k)}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{timeRange(x) || "종일"}</div>
                        <div style={{ fontSize: 10.5 }}>{on ? "가능 ✓" : "선택"}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <label className="lbl">위 일시 외에 가능한 시간이 있으면 적어 주세요 (선택)</label>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="예: 9월 26일(금) 오후 전체 가능, 9월 29일(월) 10시~12시 가능" style={{ width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <button className="b1" onClick={save} disabled={!slots.length && !note.trim()}>가능 일시 제출</button>
            <span style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{picks.length}개 선택됨{mine.length ? " · 기존 제출 내역을 덮어씁니다" : ""}</span>
          </div>
        </>
      )}

      <div className="card">
        <div className="chd"><h3>내 확정 컨설팅 일정</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{rows.length}건 · 본인 담당만 표시 · 변경은 사무국만 가능</span></div>
        <table>
          <thead><tr><th style={{ width: 130 }}>일시</th><th style={{ width: 140 }}>구분</th><th>기관</th>
            <th style={{ width: 110 }}>담당 전문가</th><th style={{ width: 150 }}>기관 담당자</th><th style={{ width: 260 }}>Zoom 링크</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const CT = CONSULT_TYPES.find((t) => t.key === c.type);
              const m = db.managers[c.orgId];
              return (
                <tr key={`${c.orgId}-${c.type}`}>
                  <td className="mono"><b>{c.date.slice(5)}</b>{c.time && <> {timeRange(c)}</>}</td>
                  <td><span className="bg g-rev" style={{ fontSize: 10.5 }}>{CT?.label || c.type}</span></td>
                  <td><b style={{ fontWeight: 500 }}>{orgOf(c.orgId).name}</b>
                    {db.pre[c.orgId]?.[c.type] && <div style={{ fontSize: 10.5, color: "var(--brand2)" }}>
                      사전 정보 제출됨 · 집행률 {db.pre[c.orgId][c.type].rate}%</div>}
                    {isApply(CT) && db.consultApps.find((a) => a.orgId === c.orgId && a.type === c.type) && <div style={{ fontSize: 10.5, color: "var(--brand2)" }}>신청서 제출됨 · 아래 참고</div>}</td>
                  <td style={{ fontSize: 11.5 }}><span className="bg g-app">{me.name}</span></td>
                  <td style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{m.name} {m.title}</td>
                  <td style={{ fontSize: 11.5 }}>
                    {c.zoom ? <a href={c.zoom} target="_blank" rel="noreferrer" className="lnk">{c.zoom}</a>
                      : <span style={{ color: "var(--ink3)" }}>사무국 등록 전</span>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 36, color: "var(--ink3)" }}>
              담당으로 배정된 확정 일정이 없습니다. 사무국이 확정·배정하면 표시됩니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="chd"><h3>컨설팅 사전 정보 · 신청서</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>내가 담당하는 기관이 해당 회차 전에 작성한 내용</span></div>
        {rows.filter((c) => isApply(CONSULT_TYPES.find((t) => t.key === c.type))).map((c) => {
          const ap = db.consultApps.find((a) => a.orgId === c.orgId && a.type === c.type);
          return ap && (
            <div key={`app-${c.orgId}-${c.type}`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <b>{orgOf(c.orgId).name}</b><span className="bg g-sub">{CONSULT_TYPES.find((t) => t.key === c.type)?.label} 신청서</span>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink3)" }}>{ap.at}</span>
              </div>
              <AppView app={ap} />
            </div>
          );
        })}
        {rows.filter((c) => db.pre[c.orgId]?.[c.type]).length === 0 && !rows.some((c) => db.consultApps.find((a) => a.orgId === c.orgId && a.type === c.type))
          ? <div style={{ padding: 30, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>담당 기관의 사전 정보가 아직 없습니다.</div>
          : rows.filter((c) => db.pre[c.orgId]?.[c.type]).map((c) => [c, db.pre[c.orgId][c.type]]).map(([c, p]) => (
            <div key={`pre-${c.orgId}-${c.type}`} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <b>{orgOf(c.orgId).name}</b><span className="bg g-sub">{CONSULT_TYPES.find((t) => t.key === c.type)?.label}</span>
                <span className="bg g-rev">예산 집행률 {p.rate}%</span>
              </div>
              {[["세부활동별 진행현황", p.progress], ["현지 여건 및 주요 이슈", p.country], ["전문가 자문 요청사항", p.ask]].map(([l, v]) => (
                <div key={l} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{l}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>{v || "—"}</div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

/* ═══════════ 기관 : 홈 · 자료 제출 ═══════════ */

function OrgDash({ db, reload, say, go, me, setKind }) {
  const mine = REPORTS.map((r) => ({ r, s: subOf(db, me.id, r.key) }));
  const mgr = db.managers[me.id];
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(mgr);
  const [errs, setErrs] = useState({});
  const cf = db.confirms.find((c) => c.orgId === me.id);
  const todos = mine.filter(({ s }) => ["none", "revision"].includes(s.status));
  const pendingDocs = db.docs.filter((d) => d.orgId === me.id && d.status === "pending").length;

  const saveMgr = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "담당자 성함을 입력해 주세요.";
    if (!form.title.trim()) e.title = "직책을 입력해 주세요.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "올바른 이메일 주소를 입력해 주세요.";
    setErrs(e);
    if (Object.keys(e).length) return;
    try { await run(sb.from("orgs").update({ manager_name: form.name.trim(), manager_title: form.title.trim(), manager_email: form.email.trim() }).eq("id", me.id)); }
    catch (e2) { say(`저장 실패: ${e2.message}`); return; }
    reload();
    setEdit(false);
    say("담당자 정보를 저장했습니다. 컨설팅 안내 메일이 이 주소로 발송됩니다.");
  };

  return (
    <div>
      <div className="cols" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1>{me.name}</h1>
          <div className="sub">{PROGRAM} · {me.year}차년도 수행기관 · 이용 기간 {me.picked}—{me.picked + 2}</div>
        </div>

        <div className="card" style={{ padding: 14, width: 290 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <b style={{ fontSize: 12.5 }}>담당자 정보</b>
            {edit ? <span className="lnk" onClick={saveMgr}>저장</span>
              : <span className="lnk" onClick={() => { setForm(mgr); setEdit(true); }}>수정</span>}
          </div>
          {edit ? (
            <>
              <input style={{ marginBottom: 6, padding: "6px 9px" }} className={errs.name ? "err" : ""}
                placeholder="성함" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input style={{ marginBottom: 6, padding: "6px 9px" }} className={errs.title ? "err" : ""}
                placeholder="직책" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input style={{ padding: "6px 9px" }} className={errs.email ? "err" : ""}
                placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {(errs.name || errs.title || errs.email) &&
                <div className="errmsg">{errs.name || errs.title || errs.email}</div>}
            </>
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.85 }}>
              <div><b>{mgr.name}</b> <span style={{ color: "var(--ink2s)" }}>{mgr.title}</span></div>
              <div style={{ color: "var(--brand2)" }}>{mgr.email}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>컨설팅 안내 메일 수신 주소</div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chd"><h3>내가 할 일</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{todos.length ? `제출할 보고서 ${todos.length}건` : "지금 제출할 자료 없음"}</span></div>
        {mine.map(({ r, s }) => {
          const lastFb = [...s.feedbacks].reverse().find((f) => f.severity === "req");
          const todo = ["none", "revision"].includes(s.status);
          return (
            <div key={r.key} style={{ padding: "13px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.label} <Badge s={s.status} /></div>
                  <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 2 }}>
                    {s.status === "revision" ? `수정 마감 ${s.dueFix}` : s.status === "approved" ? "최종 승인 완료" : s.status === "none" ? `제출 마감 ${r.due}` : "사무국 검토 중"}
                  </div>
                </div>
                {todo && <button className="b1" onClick={() => { setKind(r.key); go("submit"); }}>{s.status === "revision" ? "수정본 올리기" : "제출하기"}</button>}
              </div>
              {lastFb && s.status === "revision" && (
                <div className="note" style={{ background: "var(--amber)", color: "#6B4A0D", marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, color: "var(--amberT)", marginBottom: 4 }}>{lastFb.author} · {lastFb.at} · v{lastFb.v}에 대한 수정 요청</div>
                  {lastFb.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="cols" style={{ display: "flex", gap: 16 }}>
        <div className="card" style={{ flex: 1, padding: 16 }}>
          <h3 style={{ margin: "0 0 11px", fontSize: 13.5 }}>컨설팅</h3>
          {cf ? (
            <>
              <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: "var(--greenT)" }}>{slotLong(cf)}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 4 }}>
                {CONSULT_TYPES.find((t) => t.key === cf.type).label} · 1회 {durOf(typeOf(cf.type))}분<br />
                {cf.zoom ? `Zoom 링크 등록됨` : "Zoom 링크 대기 중"}
              </div>
            </>
          ) : <div style={{ fontSize: 11.5, color: "var(--ink2s)", lineHeight: 1.8 }}>
            컨설팅 가능 일자를 접수하고 있습니다.</div>}
          <button className="b2" style={{ width: "100%", marginTop: 12 }} onClick={() => go("consult")}>컨설팅 일정 →</button>
        </div>

        <div className="card" style={{ flex: 1, padding: 16 }}>
          <h3 style={{ margin: "0 0 11px", fontSize: 13.5 }}>예산변경 / 사업변경</h3>
          <div style={{ fontSize: 11.5, color: "var(--ink2s)", lineHeight: 1.9 }}>
            내부 예산변경 <b className="mono" style={{ color: "var(--ink)" }}>{(db.budgets[me.id] || []).length}</b>건 등록<br />
            승인 대기 <b className="mono" style={{ color: pendingDocs ? "var(--amberT)" : "var(--ink)" }}>{pendingDocs}</b>건
          </div>
          <button className="b2" style={{ width: "100%", marginTop: 12 }} onClick={() => go("budget")}>예산변경 관리 →</button>
        </div>

        <div className="card" style={{ flex: 1, padding: 16 }}>
          <h3 style={{ margin: "0 0 11px", fontSize: 13.5 }}>제출 이력</h3>
          {mine.every(({ s }) => s.versions.length === 0)
            ? <div style={{ fontSize: 11.5, color: "var(--ink3)" }}>아직 제출한 자료가 없습니다.</div>
            : mine.filter(({ s }) => s.versions.length).map(({ r, s }) => {
              const v = s.versions[s.versions.length - 1];
              return (
                <div key={r.key} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                  <span style={{ flex: 1 }}>{r.label}</span>
                  <b className="mono" style={{ color: "var(--brand2)" }}>v{v.no}</b>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{v.at}</span>
                  {v.final && <span className="bg g-app" style={{ fontSize: 9.5 }}>최종본</span>}
                </div>
              );
            })}
          <button className="b2" style={{ width: "100%", marginTop: 8 }} onClick={() => go("submit")}>자료 제출 →</button>
        </div>
      </div>
    </div>
  );
}

function OrgSubmit({ db, reload, say, log, me, kind, setKind, R }) {
  const s = subOf(db, me.id, kind);
  const [note, setNote] = useState(""); const [reply, setReply] = useState({}); const [err, setErr] = useState("");
  const isFix = s.status === "revision";
  const lastFb = [...s.feedbacks].reverse().find((f) => f.severity === "req");
  const locked = ["submitted", "reviewing", "approved"].includes(s.status);
  const notYet = R.start && TODAY < R.start && s.status === "none";

  const submit = async (files) => {
    if (isFix && !note.trim()) { setErr("변경 사항 메모는 필수 입력입니다."); say("변경 사항을 입력해야 재제출할 수 있습니다."); return; }
    setErr("");
    const no = (s.versions[s.versions.length - 1]?.no || 0) + 1;
    try {
      const meta = await uploadFiles(`org-${me.id}/${kind}/v${no}`, files);
      await run(sb.from("versions").insert({ org_id: me.id, kind, no, note: note.trim(), files: meta }));
      await run(sb.from("submissions").upsert({ org_id: me.id, kind, status: "submitted", due_fix: null }));
      await log("자료 제출", `${R.label} v${no}`);
    } catch (e) { say(`제출 실패: ${e.message}`); throw e; }
    reload();
    setNote("");
    say("제출이 완료되었습니다. 사무국에 알림이 발송됩니다.");
  };

  const sendReply = async (fid) => {
    const t = (reply[fid] || "").trim(); if (!t) return;
    try { await run(sb.from("feedbacks").update({ reply: t }).eq("id", fid)); }
    catch (e) { say(`등록 실패: ${e.message}`); return; }
    reload();
    setReply({ ...reply, [fid]: "" }); say("답변을 등록했습니다.");
  };

  return (
    <div>
      <PageHead title="자료 제출" sub={`${R.label} · 제출 기간 ${R.start ? `${R.start} – ` : "~ "}${R.due}`} right={<Badge s={s.status} />} />
      <ReportTabs kind={kind} setKind={setKind} />

      {notYet ? (
        <div className="card note" style={{ textAlign: "center", padding: 22, background: "var(--gray)", color: "var(--grayT)" }}>
          {R.label} 제출은 {R.start}부터 가능합니다. (마감 {R.due})
        </div>
      ) : locked ? (
        <div className="card note" style={{ textAlign: "center", padding: 22,
          background: s.status === "approved" ? "var(--green)" : "var(--blue)",
          color: s.status === "approved" ? "var(--greenT)" : "var(--blueT)" }}>
          {s.status === "approved" ? "최종 승인이 완료되었습니다. 최종본은 자료실에 보관됩니다."
            : "제출이 접수되어 사무국이 검토 중입니다."}
        </div>
      ) : (
        <>
          {isFix && lastFb && (
            <div className="card note" style={{ background: "var(--amber)", color: "#6B4A0D", marginBottom: 14, borderColor: "#EFDCB6" }}>
              <div style={{ fontSize: 10.5, color: "var(--amberT)", marginBottom: 5 }}>
                받은 수정 요청 · {lastFb.author} · {lastFb.at} · v{lastFb.v}</div>
              {lastFb.content}
            </div>
          )}
          {isFix && (
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <label className="lbl">변경 사항 메모 (필수)</label>
              <textarea rows={3} className={err ? "err" : ""} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="무엇을 어떻게 고쳤는지 적어 주세요. 예) 8월 강사비 원천징수 영수증 3건 추가, 인건비 산출근거 표 보완" />
              {err && <div className="errmsg">{err}</div>}
            </div>
          )}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>
              {isFix ? `수정본 업로드 (v${s.versions.length + 1})` : "파일 업로드"}</h3>
            <Uploader onDone={submit} />
          </div>
        </>
      )}

      {s.feedbacks.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="chd"><h3>받은 검토 의견</h3></div>
          {[...s.feedbacks].reverse().map((f) => (
            <div key={f.id} style={{ padding: "13px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--ink3)", marginBottom: 5 }}>
                <b style={{ color: "var(--ink)", fontWeight: 500 }}>{f.author}</b>
                <span className="mono">{f.at}</span><span className="mono" style={{ color: "var(--brand2)" }}>v{f.v}</span>
                {f.severity === "req" && <span className="bg g-req">수정 필요</span>}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.75 }}>{f.content}</div>
              {f.reply ? (
                <div style={{ marginTop: 9, paddingLeft: 11, borderLeft: "2px solid var(--line)" }}>
                  <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{me.name} 답변</div>
                  <div style={{ fontSize: 12 }}>{f.reply}</div></div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input placeholder="궁금한 점을 남기면 사무국이 확인합니다" value={reply[f.id] || ""}
                    onChange={(e) => setReply({ ...reply, [f.id]: e.target.value })} />
                  <button className="b2" onClick={() => sendReply(f.id)}>답변</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════ 최종 자료실 · 참여 기관 · 공지 · 로그 ═══════════ */

function Archive({ db, say, log, kind, setKind, R }) {
  const rows = db.subs.filter((s) => s.kind === kind && s.status === "approved");
  const total = rows.reduce((a, s) => a + s.versions.filter((v) => v.final)
    .reduce((x, v) => x + v.files.reduce((y, f) => y + f.s, 0), 0), 0);
  return (
    <div>
      <PageHead title="최종 자료실" sub="사무국이 최종 승인한 버전만 모았습니다." />
      <ReportTabs kind={kind} setKind={setKind} />
      <div className="card">
        <div className="chd">
          <h3>승인된 {R.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{rows.length}개 기관</span></h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>총 {(total / 1024).toFixed(2)}GB</span>
        </div>
        <table>
          <thead><tr><th>기관명</th><th>승인 버전</th><th>제출 파일</th><th /></tr></thead>
          <tbody>
            {rows.map((s) => {
              const o = orgOf(s.orgId);
              const v = s.versions.find((x) => x.final) || s.versions[s.versions.length - 1];
              return (
                <tr key={s.id} className="rw">
                  <td><b style={{ fontWeight: 500 }}>{o.name}</b></td>
                  <td><span className="bg g-app">v{v.no} · 최종본</span></td>
                  <td colSpan={2}>{v.files.map((f, i) => <FileRow key={i} f={f} say={say} onDown={() => log("최종본 다운로드", `${o.name} · ${f.n}`)} />)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "11px 16px", borderTop: "1px solid var(--line2)", fontSize: 11, color: "var(--ink3)" }}>
          다운로드 기록은 활동 로그에 남습니다.
        </div>
      </div>
    </div>
  );
}

function OrgsPage({ db, setDetail, go, kind, R }) {
  const [yf, setYf] = useState(0);
  const ORGS = db.orgs.filter((o) => !o.ended && o.year >= 1), ENDED = db.orgs.filter((o) => o.ended);
  const cnt = { 1: 0, 2: 0, 3: 0 };
  ORGS.forEach((o) => cnt[o.year]++);
  const years = yf ? [yf] : [1, 2, 3];
  const YL = { 1: "사업 기반 마련", 2: "사업 실행 및 확장", 3: "성과 확산 및 정착" };

  return (
    <div>
      <PageHead title="참여 기관"
        sub={`수행 차년도별 참여 기관과 이용 기간을 확인하세요. 선발 연도 기준 3년간 이용할 수 있습니다.`} />
      <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
        <button className={`chip ${!yf ? "chip-on" : ""}`} onClick={() => setYf(0)}>전체 기관<span className="chip-c">{ORGS.length}</span></button>
        {[1, 2, 3].map((y) => (
          <button key={y} className={`chip ${yf === y ? "chip-on" : ""}`} onClick={() => setYf(y)}>
            {y}차년도 수행기관<span className="chip-c">{cnt[y]}</span></button>
        ))}
      </div>

      {years.map((y) => (
        <div key={y} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>0{y}</span>
              <b style={{ fontSize: 13.5 }}>{y}차년도 수행기관</b>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>{cnt[y]}개 기관</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>{YL[y]}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {ORGS.filter((o) => o.year === y).map((o) => {
              const s = subOf(db, o.id, kind);
              return (
                <div key={o.id} className="card" style={{ width: "calc(33.33% - 8px)", padding: 15 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="ini" style={{ margin: 0 }}>{o.ini}</span>
                    <span className="bg g-rev" style={{ fontSize: 10 }}>{y}차년도</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 10 }}>{o.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                    {o.picked}년 선발 · 이용 {o.picked}—{o.picked + 2}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--line2)" }}>
                    <span><Badge s={s.status} /><span style={{ fontSize: 10, color: "var(--ink3)", marginLeft: 5 }}>{R.label}</span></span>
                    <span className="lnk" onClick={() => { go("submit"); setTimeout(() => setDetail(o.id), 0); }}>제출 자료 →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>04</span>
          <b style={{ fontSize: 13.5 }}>이용 종료 기관</b>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>3년 경과 · 로그인 차단</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ENDED.map((o) => (
            <div key={o.id} className="card" style={{ width: "calc(33.33% - 8px)", padding: 15, background: "#FAFBFD" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="ini" style={{ margin: 0, background: "var(--gray)", color: "var(--grayT)" }}>{o.ini}</span>
                <span className="bg g-red" style={{ fontSize: 10 }}>이용 종료</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 10, color: "var(--ink2s)" }}>{o.name}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                {o.picked}년 선발 · 이용 {o.picked}—{o.picked + 2} 종료</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Notices({ go }) {
  return (
    <div>
      <PageHead title="공지사항" sub="사업 운영에 필요한 안내를 확인하세요." />
      {NOTICES.length === 0 && <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>등록된 공지가 없습니다.</div>}
      {NOTICES.map((n, i) => (
        <div key={i} className="card" style={{ marginBottom: 14 }}>
          <div className="chd"><h3>{n.t}</h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{n.d}</span></div>
          <div style={{ padding: "16px 20px 18px" }}>
            {n.body.map((p, i) => (
              <p key={i} style={{ margin: "0 0 11px", fontSize: 12.5, lineHeight: 1.85, color: "#3D4A66" }}>{p}</p>
            ))}
            {n.cta && <button className="b2" onClick={() => go(n.cta[1])}>{n.cta[0]}</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogPage({ db }) {
  const [q, setQ] = useState("");
  const rows = db.logs.filter((l) => (l.who + l.action + l.target).includes(q));
  return (
    <div>
      <PageHead title="활동 로그" sub="누가 언제 무엇을 처리했는지 기록됩니다. 문의 대응 시 참고하세요." />
      <div className="card">
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line2)" }}>
          <input placeholder="기관명 · 처리 내용 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table>
          <thead><tr><th style={{ width: 140 }}>일시</th><th style={{ width: 170 }}>처리자</th>
            <th style={{ width: 150 }}>처리 내용</th><th>대상</th></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "var(--ink2s)" }}>{l.at}</td>
                <td style={{ fontSize: 12 }}>{l.who}</td>
                <td><span className="bg g-not">{l.action}</span></td>
                <td style={{ color: "var(--ink2s)" }}>{l.target}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 36, color: "var(--ink3)" }}>
              검색 결과가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>


    </div>
  );
}

/* ═══════════ 관리자 : 계정 관리 ═══════════ */

function Users({ db, reload, say, log, profile }) {
  const ROLE = { admin: "관리자", org: "기관", expert: "전문가" };
  const blank = { role: "org", orgId: "", name: "", title: "", email: "", password: "" };
  const [f, setF] = useState(blank);
  const [org, setOrg] = useState({ name: "", picked: CUR_YEAR });
  const [busy, setBusy] = useState(false);
  const [ed, setEd] = useState(null);   // {id, name, title} 이름·부서 인라인 수정

  const saveEd = async () => {
    try { await run(sb.from("profiles").update({ name: ed.name.trim(), title: ed.title.trim() }).eq("id", ed.id)); }
    catch (e) { say(`저장 실패: ${e.message}`); return; }
    setEd(null); reload(); say("저장했습니다. 다시 로그인하면 상단 표시도 바뀝니다.");
  };

  const create = async () => {
    if (!f.email.trim() || f.password.length < 8) { say("이메일과 8자 이상 비밀번호를 입력해 주세요."); return; }
    if (f.role === "org" && !f.orgId) { say("기관을 선택해 주세요."); return; }
    if (f.role !== "org" && !f.name.trim()) { say("이름을 입력해 주세요."); return; }
    setBusy(true);
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, orgId: Number(f.orgId) || null, email: f.email.trim() }) }).then((x) => x.json());
    setBusy(false);
    if (r.error) { say(`생성 실패: ${r.error}`); return; }
    await log("계정 생성", `${ROLE[f.role]} · ${f.email}`);
    setF(blank); reload(); say("계정을 만들었습니다. 이메일과 임시 비밀번호를 담당자에게 전달해 주세요.");
  };

  const remove = async (p) => {
    if (!confirm(`${p.email} 계정을 삭제할까요? 로그인이 즉시 차단됩니다.`)) return;
    const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }) }).then((x) => x.json());
    if (r.error) { say(`삭제 실패: ${r.error}`); return; }
    await log("계정 삭제", `${ROLE[p.role]} · ${p.email}`);
    reload(); say("삭제했습니다.");
  };

  const addOrg = async () => {
    if (!org.name.trim()) { say("기관명을 입력해 주세요."); return; }
    try { await run(sb.from("orgs").insert({ name: org.name.trim(), picked: Number(org.picked) })); }
    catch (e) { say(`추가 실패: ${e.message}`); return; }
    await log("기관 추가", `${org.name} · ${org.picked}년 선발`);
    setOrg({ name: "", picked: CUR_YEAR }); reload(); say("기관을 추가했습니다.");
  };

  return (
    <div>
      <PageHead title="계정 관리" sub="기관·전문가·관리자 계정을 발급하고, 참여 기관을 등록합니다." />

      <div className="cols" style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div className="card" style={{ flex: 2, padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>계정 발급</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select style={{ width: 110 }} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {f.role === "org" ? (
              <select value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value })}>
                <option value="">기관 선택</option>
                {db.orgs.filter((o) => !o.ended).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.year}차년도)</option>)}
              </select>
            ) : (
              <>
                <input placeholder="이름" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <input placeholder="직책" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="email" placeholder="로그인 이메일" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input placeholder="임시 비밀번호 (8자 이상)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <button className="b1" disabled={busy} onClick={create}>발급</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8 }}>
            초대 메일은 발송되지 않습니다. 이메일과 임시 비밀번호를 직접 전달해 주세요.
          </div>
        </div>

        <div className="card" style={{ flex: 1, padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>참여 기관 추가</h3>
          <input placeholder="기관명" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={org.picked} onChange={(e) => setOrg({ ...org, picked: e.target.value })}>
              {[0, 1, 2].map((i) => <option key={i} value={CUR_YEAR - i}>{CUR_YEAR - i}년 선발 ({i + 1}차년도)</option>)}
            </select>
            <button className="b1" onClick={addOrg}>추가</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chd"><h3>계정 목록</h3><span style={{ fontSize: 11, color: "var(--ink3)" }}>{db.profiles.length}개</span></div>
        <table>
          <thead><tr><th style={{ width: 90 }}>구분</th><th>이름 / 기관</th><th>이메일</th><th style={{ width: 150 }} /></tr></thead>
          <tbody>
            {db.profiles.map((p) => (
              <tr key={p.id}>
                <td><span className={`bg ${p.role === "admin" ? "g-app" : p.role === "expert" ? "g-sub" : "g-rev"}`}>{ROLE[p.role]}</span></td>
                <td>{p.role === "org" ? (orgOf(p.org_id)?.name ?? "—")
                  : ed?.id === p.id ? (
                    <span style={{ display: "flex", gap: 6 }}>
                      <input style={{ padding: "5px 8px" }} placeholder="이름" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} />
                      <input style={{ padding: "5px 8px" }} placeholder="부서·직책" value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} />
                    </span>
                  ) : <>{p.name} <span style={{ color: "var(--ink2s)" }}>{p.title}</span></>}</td>
                <td style={{ color: "var(--brand2)" }}>{p.email}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {p.role !== "org" && (ed?.id === p.id
                    ? <><button className="b1 bs" onClick={saveEd}>저장</button> <button className="b2 bs" onClick={() => setEd(null)}>취소</button></>
                    : <button className="b2 bs" onClick={() => setEd({ id: p.id, name: p.name, title: p.title })}>수정</button>)}
                  {p.id !== profile.id && <> <button className="b2 bs" onClick={() => remove(p)}>삭제</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════ 관리자 : 사업 설정 ═══════════ */

// 컴포넌트 안에서 정의하면 렌더마다 새 타입이 되어 입력칸이 리마운트됨 → 한글 조합이 끊긴다. 반드시 모듈 레벨.
const IN = ({ style, ...props }) => <input style={{ padding: "6px 9px", ...style }} {...props} />;
const CTA_PAGES = [["", "버튼 없음"], ["submit", "자료 제출"], ["consult", "컨설팅 일정"], ["budget", "예산변경 / 사업변경"], ["annual", "연간 사업 일정"]];
const newKey = (p) => `${p}${Date.now().toString(36)}`;

function Settings({ db, reload, say, log }) {
  const init = () => {
    const c = currentSettings();
    return { ...c,
      consult_types: c.consult_types.map((t) => ({ key: t.key, label: t.label, required: !!t.required, mode: t.mode || "slots", slots: slotsOf(t), open_at: t.open_at || "", dur: t.dur || 120 })),
      notices: c.notices.map((n) => ({ t: n.t, d: n.d, body: n.body.join("\n\n"), ctaLabel: n.cta?.[0] || "", ctaPage: n.cta?.[1] || "" })) };
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const up = (k, v) => setF({ ...f, [k]: v });
  const upRow = (k, i, patch) => up(k, f[k].map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const delRow = (k, i) => up(k, f[k].filter((_, j) => j !== i));
  const usedTypes = new Set([...db.avail.map((a) => a.type), ...db.confirms.map((c) => c.type)]);
  const usedReports = new Set(db.reports.map((r) => r.type));
  const usedKinds = new Set(db.subs.filter((s) => s.versions.length).map((s) => s.kind));
  const D = /^\d{4}\.\d{2}\.\d{2}$/;

  const save = async () => {
    const e = [];
    if (!f.program.trim()) e.push("사업명");
    f.reports.forEach((r, i) => { if (!r.label.trim()) e.push(`보고서 ${i + 1} 이름`); if (!D.test(r.due)) e.push(`보고서 ${i + 1} 마감일`);
      if (r.start && r.start > r.due) e.push(`보고서 ${i + 1} 시작일이 마감일보다 늦음`); });
    f.consult_types.forEach((t, i) => { if (!t.label.trim()) e.push(`컨설팅 ${i + 1} 이름`);
      t.slots.forEach((x) => { if (!D.test(x.date)) e.push(`컨설팅 ${i + 1} 일자`); }); });
    f.expert_reports.forEach((r, i) => { if (!r.label.trim()) e.push(`전문가 보고서 ${i + 1} 이름`); if (!D.test(r.due)) e.push(`전문가 보고서 ${i + 1} 마감`); });
    f.notices.forEach((n, i) => { if (!n.t.trim()) e.push(`공지 ${i + 1} 제목`); });
    if (e.length) { say(`확인 필요: ${e.slice(0, 3).join(", ")}${e.length > 3 ? " 외" : ""}`); return; }
    const data = {
      program: f.program.trim(), team: f.team.trim(), program_year: Number(f.program_year),
      reports: f.reports.map((r) => ({ key: r.key, label: r.label.trim(), start: r.start || "", due: r.due })),
      fix_days: Number(f.fix_days) || 7, cap: Number(f.cap) || 2,
      consult_types: f.consult_types.map((t) => ({ key: t.key, label: t.label.trim(), required: !!t.required, mode: t.mode || "slots",
        slots: t.slots.map((x) => ({ date: x.date, time: x.time || "" })).filter((x, i, arr) => arr.findIndex((y) => sameSlot(x, y)) === i)
          .sort((a, b) => slotKey(a).localeCompare(slotKey(b))) })),
      expert_reports: f.expert_reports.map((r) => ({ key: r.key, label: r.label.trim(), due: r.due })),
      notices: f.notices.map((n) => ({ t: n.t.trim(), d: n.d, by: f.team.trim(), body: n.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        cta: n.ctaPage ? [n.ctaLabel || "바로가기 →", n.ctaPage] : null })),
      mail_subject: f.mail_subject.trim(), mail_body: f.mail_body.trim(),
    };
    setBusy(true);
    try {
      await run(sb.from("settings").upsert({ id: 1, data, updated_at: new Date().toISOString() }));
      await log("사업 설정 변경", data.program);
    } catch (err) { say(`저장 실패: ${err.message}`); setBusy(false); return; }
    await reload(); setBusy(false); say("저장했습니다. 모든 화면에 바로 반영됩니다.");
  };

  return (
    <div>
      <PageHead title="사업 설정" sub="사업명, 마감일, 컨설팅 회차, 공지사항을 여기서 바꿉니다. 저장하면 기관·전문가 화면에 즉시 반영됩니다."
        right={<button className="b1" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>} />

      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>기본 정보</h3>
        <div className="cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="lbl">사업명</label><IN value={f.program} onChange={(e) => up("program", e.target.value)} /></div>
          <div><label className="lbl">운영 부서명 (문구·메일 서명)</label><IN value={f.team} onChange={(e) => up("team", e.target.value)} /></div>
          <div><label className="lbl">사업연도 (이 해에 선발된 기관 = 1차년도)</label><IN type="number" value={f.program_year} onChange={(e) => up("program_year", e.target.value)} /></div>
          <div><label className="lbl">수정 요청 시 부여 기한 (일)</label><IN type="number" value={f.fix_days} onChange={(e) => up("fix_days", e.target.value)} /></div>
          <div><label className="lbl">컨설팅 일시별 확정 정원 (기관 수)</label><IN type="number" value={f.cap} onChange={(e) => up("cap", e.target.value)} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chd"><h3>기관 제출 보고서</h3>
          <button className="b2 bs" onClick={() => up("reports", [...f.reports, { key: newKey("p"), label: "", due: "" }])}>+ 보고서 추가</button></div>
        <table>
          <thead><tr><th>이름</th><th style={{ width: 170 }}>제출 시작일 (선택)</th><th style={{ width: 170 }}>제출 마감일</th><th style={{ width: 70 }} /></tr></thead>
          <tbody>
            {f.reports.map((r, i) => (
              <tr key={r.key}>
                <td><IN value={r.label} placeholder="중간보고서" onChange={(e) => upRow("reports", i, { label: e.target.value })} /></td>
                <td><IN type="date" value={r.start ? iso(r.start) : ""} onChange={(e) => upRow("reports", i, { start: fmt(e.target.value) })} /></td>
                <td><IN type="date" value={r.due ? iso(r.due) : ""} onChange={(e) => upRow("reports", i, { due: fmt(e.target.value) })} /></td>
                <td style={{ textAlign: "right" }}>
                  {usedKinds.has(r.key) || f.reports.length === 1 ? <span style={{ fontSize: 10.5, color: "var(--ink3)" }}>{usedKinds.has(r.key) ? "제출 있음" : ""}</span>
                    : <button className="b2 bs" onClick={() => delRow("reports", i)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--ink3)", borderTop: "1px solid var(--line2)" }}>
          기관 화면의 자료 제출 탭이 이 순서대로 생깁니다. 시작일을 넣으면 그날부터 제출할 수 있고, 비우면 바로 제출 가능합니다. 이미 제출된 보고서 종류는 삭제할 수 없습니다.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chd"><h3>컨설팅 회차</h3>
          <button className="b2 bs" onClick={() => up("consult_types", [...f.consult_types, { key: newKey("c"), label: "", required: true, slots: [], open_at: "", dur: 120 }])}>+ 회차 추가</button></div>
        {f.consult_types.map((t, i) => {
          const setSlots = (slots) => upRow("consult_types", i, { slots });
          return (
            <div key={t.key} style={{ padding: 16, borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <IN style={{ flex: 1 }} value={t.label} placeholder="회차 이름 (예: 하반기 필수컨설팅)" onChange={(e) => upRow("consult_types", i, { label: e.target.value })} />
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={!!t.required} onChange={(e) => upRow("consult_types", i, { required: e.target.checked })} />필수</label>
                <select style={{ width: 150, padding: "6px 8px", fontSize: 12 }} value={t.mode || "slots"} onChange={(e) => upRow("consult_types", i, { mode: e.target.value })}>
                  <option value="slots">일정 선택 방식</option><option value="apply">신청서 방식</option>
                </select>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>1건
                  <IN type="number" style={{ width: 70 }} value={t.dur || 120} onChange={(e) => upRow("consult_types", i, { dur: Number(e.target.value) || 120 })} />분</label>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>기관 공개
                  <IN type="datetime-local" style={{ width: 200 }} value={t.open_at || ""} onChange={(e) => upRow("consult_types", i, { open_at: e.target.value })} /></label>
                {usedTypes.has(t.key) ? <span style={{ fontSize: 10.5, color: "var(--ink3)", whiteSpace: "nowrap" }}>신청 있음</span>
                  : <button className="b2 bs" onClick={() => delRow("consult_types", i)}>회차 삭제</button>}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>후보 일시 — 시간을 비우면 그날 09:00~18:00 를 소요 시간 단위(예: 2시간)로 나눠 전문가가 시간대를 고릅니다. 시간을 넣으면 그 시작 시각 한 칸만 후보가 됩니다.</div>
              {t.slots.map((x, j) => (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <IN type="date" style={{ width: 170 }} value={x.date ? iso(x.date) : ""} onChange={(e) => setSlots(t.slots.map((y, k) => (k === j ? { ...y, date: fmt(e.target.value) } : y)))} />
                  <IN type="time" style={{ width: 130 }} value={x.time || ""} onChange={(e) => setSlots(t.slots.map((y, k) => (k === j ? { ...y, time: e.target.value } : y)))} />
                  <button className="b2 bs" onClick={() => setSlots(t.slots.filter((_, k) => k !== j))}>삭제</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="b2 bs" onClick={() => setSlots([...t.slots, { date: t.slots[t.slots.length - 1]?.date || "", time: "" }])}>+ 일시 추가</button>
                {t.slots.length > 0 && <button className="b2 bs" onClick={() => { const last = t.slots[t.slots.length - 1]; const d = new Date(iso(last.date)); d.setDate(d.getDate() + 1);
                  setSlots([...t.slots, ...t.slots.filter((y) => y.date === last.date).map((y) => ({ ...y, date: fmt(d) }))]); }}>+ 다음 날 같은 시간으로</button>}
              </div>
            </div>
          );
        })}
        <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--ink3)", borderTop: "1px solid var(--line2)" }}>
          기관이 이미 가능 일시를 신청한 회차는 삭제할 수 없습니다. 일시를 지우면 그 일시의 신청 내역은 화면에서 사라집니다.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chd"><h3>전문가 보고서 종류</h3>
          <button className="b2 bs" onClick={() => up("expert_reports", [...f.expert_reports, { key: newKey("r"), label: "", due: "" }])}>+ 종류 추가</button></div>
        <table>
          <thead><tr><th>이름</th><th style={{ width: 170 }}>제출 마감 (YYYY.MM.DD)</th><th style={{ width: 70 }} /></tr></thead>
          <tbody>
            {f.expert_reports.map((r, i) => (
              <tr key={r.key}>
                <td><IN value={r.label} onChange={(e) => upRow("expert_reports", i, { label: e.target.value })} /></td>
                <td><IN value={r.due} onChange={(e) => upRow("expert_reports", i, { due: e.target.value })} /></td>
                <td style={{ textAlign: "right" }}>
                  {usedReports.has(r.key) ? <span style={{ fontSize: 10.5, color: "var(--ink3)" }}>제출 있음</span>
                    : <button className="b2 bs" onClick={() => delRow("expert_reports", i)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chd"><h3>컨설팅 확정 안내 메일</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>Zoom 링크 저장·발송 시 담당자에게 가는 메일</span></div>
        <div style={{ padding: 16 }}>
          <label className="lbl">제목</label>
          <IN value={f.mail_subject} onChange={(e) => up("mail_subject", e.target.value)} />
          <label className="lbl" style={{ marginTop: 12 }}>본문</label>
          <textarea rows={14} value={f.mail_body} onChange={(e) => up("mail_body", e.target.value)} style={{ fontFamily: "inherit" }} />
          <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8, lineHeight: 1.8 }}>
            아래 표시는 발송할 때 실제 값으로 바뀝니다: {MAIL_VARS.map((k) => <code key={k} style={{ margin: "0 3px", background: "var(--gray)", padding: "1px 5px", borderRadius: 4 }}>{k}</code>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chd"><h3>공지사항</h3>
          <button className="b2 bs" onClick={() => up("notices", [{ t: "", d: TODAY, body: "", ctaLabel: "", ctaPage: "" }, ...f.notices])}>+ 공지 추가</button></div>
        {f.notices.length === 0 && <div style={{ padding: 26, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>등록된 공지가 없습니다.</div>}
        {f.notices.map((n, i) => (
          <div key={i} style={{ padding: 16, borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <IN value={n.t} placeholder="제목" onChange={(e) => upRow("notices", i, { t: e.target.value })} />
              <IN style={{ width: 130 }} value={n.d} placeholder="2027.03.02" onChange={(e) => upRow("notices", i, { d: e.target.value })} />
              <button className="b2 bs" onClick={() => delRow("notices", i)}>삭제</button>
            </div>
            <textarea rows={4} value={n.body} placeholder="본문. 문단은 빈 줄로 구분" onChange={(e) => upRow("notices", i, { body: e.target.value })} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <select style={{ width: 180 }} value={n.ctaPage} onChange={(e) => upRow("notices", i, { ctaPage: e.target.value })}>
                {CTA_PAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {n.ctaPage && <IN value={n.ctaLabel} placeholder="버튼 문구 (예: 자료 제출로 이동 →)" onChange={(e) => upRow("notices", i, { ctaLabel: e.target.value })} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
