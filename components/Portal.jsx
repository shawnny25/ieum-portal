"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/client";
import { loadDb, run, uploadFiles, download } from "@/lib/db";
import { PROGRAM, TEAM, CUR_YEAR, REPORT_DUE, FIX_DAYS, CAP, MAX_MB, APPROVAL_THRESHOLD, BUDGET_LEVELS,
  CONSULT_TYPES, EXPERT_REPORTS, ST, CAT, NOTICES, fmt, iso, TODAY, won, mb, currentSettings } from "@/lib/config";

/* ══════════════════════════════════════════════════════════
   이음 · NGO PARTNERS PORTAL — 관리자 / 기관 / 전문가 3종 화면
   데이터: Supabase (lib/db.js 에서 조립). 모든 변경은 DB 쓰기 후 reload().
   ══════════════════════════════════════════════════════════ */

let ORGS = [];
const orgOf = (id) => ORGS.find((o) => o.id === id);
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
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
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

  const ctx = { db, reload, say, go, log, me, who, role, orgOf, detail, setDetail, profile };

  return (
    <div className="ip" style={{ display: "flex", minHeight: "100vh" }}>
      <div className="side">
        <div className="brand"><div className="logo">n</div><span style={{ fontSize: 17, fontWeight: 700 }}>이음</span></div>
        <div className="brandsub">NGO PARTNERS PORTAL</div>
        <div className="navcap">{role === "expert" ? "전문가 메뉴" : "사업 관리"}</div>
        {NAV.map(([k, label, ic]) => (
          <div key={k} className={`nvi ${cur === k ? "nvi-on" : ""}`} onClick={() => go(k)}>
            <Icon n={ic} />{label}
          </div>
        ))}
        <div className="sidefoot">
          <div style={{ color: "#fff", fontWeight: 500, marginBottom: 3 }}>{PROGRAM}</div>
          {role === "org"
            ? <>이용 기간 {me.picked} — {me.picked + 2} (3년)<br />{me.year}차년도 수행기관</>
            : <>{db.subs.length}개 기관과 함께하는 사업<br />운영 기간 {CUR_YEAR}.03 — 12</>}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="top">
          <div className="crumb">{PROGRAM} &nbsp;/&nbsp; <b>{title}</b></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 12, color: "var(--ink2s)" }}>{role === "org" ? me.name : `${profile.name} ${profile.title}`}</span>
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

function AdminDash({ db, go, setDetail }) {
  const c = { none: 0, submitted: 0, reviewing: 0, revision: 0, approved: 0 };
  db.subs.forEach((s) => c[s.status]++);
  const pct = Math.round((c.approved / (db.subs.length || 1)) * 100);
  const pending = db.docs.filter((d) => d.status === "pending").length;
  const h2 = CONSULT_TYPES.find((t) => t.key === "h2");
  const applied = new Set(db.avail.filter((a) => a.type === "h2").map((a) => a.orgId)).size;
  const fixed = db.confirms.filter((c2) => c2.type === "h2").length;

  return (
    <div>
      <PageHead title="통합 대시보드" sub="기관별 진행 상황과 오늘 해야 할 업무를 살펴보세요." />

      <div className="card" style={{ display: "flex", padding: "14px 0", marginBottom: 14 }}>
        {[["미제출", c.none, "#98A3BC"], ["검토 중", c.reviewing, "#3E63C4"], ["수정 요청", c.revision, "#D9A03C"],
          ["최종 완료", c.approved, "#25A366"], ["승인 대기", pending, "#8A6BD9"]].map(([l, v, col]) => (
          <div key={l} style={{ flex: 1, display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px" }}>
            <span style={{ fontSize: 12, color: "var(--ink2s)" }}><span className="dot" style={{ background: col }} />{l}</span>
            <span><b className="mono" style={{ fontSize: 20 }}>{v}</b>
              <span style={{ fontSize: 11, color: "var(--ink3)", marginLeft: 2 }}>건</span></span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>기관별 제출 현황 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>중간보고서</span></h3>
              <span className="lnk" onClick={() => go("submit")}>전체 보기 →</span></div>
            <table>
              <thead><tr><th>기관명</th><th>진행 상태</th><th>최근 제출</th><th>버전</th><th /></tr></thead>
              <tbody>
                {db.subs.slice(0, 6).map((s) => {
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
              <span>{db.subs.length}개 기관 중 최대 6개 표시</span><span>마감일 {REPORT_DUE}</span>
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
            <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>중간보고서 완료율</h3>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--ink2s)" }}>최종 승인 기준</span>
              <span><b className="mono" style={{ fontSize: 25, color: "var(--brand2)" }}>{pct}</b>
                <span style={{ fontSize: 12, color: "var(--brand2)" }}>%</span></span>
            </div>
            <div className="bar" style={{ margin: "7px 0 8px" }}><div style={{ width: `${pct}%` }} /></div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>전체 {db.subs.length}건 중 {c.approved}건 완료</div>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 13.5 }}>{h2.label}</h3>
            <div style={{ fontSize: 11.5, color: "var(--ink2s)", lineHeight: 1.9 }}>
              기간 {h2.period}<br />
              가능일자 신청 <b className="mono" style={{ color: "var(--ink)" }}>{applied}</b>/{db.subs.length} 기관<br />
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
  const { db, reload, say, log, who, detail, setDetail } = ctx;
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [text, setText] = useState("");

  if (detail) {
    const o = orgOf(detail); const s = db.subs.find((x) => x.orgId === detail);
    // ponytail: 여러 테이블 순차 쓰기 (트랜잭션 아님). 문제 생기면 Postgres 함수(rpc)로 묶을 것.
    const act = async (kind) => {
      if (kind !== "start" && !text.trim()) { say("의견을 입력해 주세요."); return; }
      const vno = s.versions[s.versions.length - 1].no;
      try {
        if (kind === "start") {
          await run(sb.from("submissions").update({ status: "reviewing" }).eq("org_id", detail));
        } else {
          await run(sb.from("feedbacks").insert({ org_id: detail, v: vno, author: who, severity: kind === "revise" ? "req" : "info", content: text.trim() }));
          if (kind === "revise") {
            await run(sb.from("submissions").update({ status: "revision", due_fix: dueFix() }).eq("org_id", detail));
          } else {
            await run(sb.from("submissions").update({ status: "approved", due_fix: null }).eq("org_id", detail));
            await run(sb.from("versions").update({ final: false }).eq("org_id", detail));
            await run(sb.from("versions").update({ final: true }).match({ org_id: detail, no: vno }));
            await run(sb.from("alerts").insert({ org_id: detail, text: "중간보고서가 최종 승인되었습니다." }));
          }
          await log(kind === "revise" ? "수정 요청" : "최종 승인", `${o.name} · 중간보고서`);
        }
      } catch (e) { say(`처리 실패: ${e.message}`); return; }
      setText(""); reload();
      say(kind === "start" ? "검토를 시작했습니다." : kind === "revise" ? "수정을 요청했습니다." : "최종 승인했습니다.");
    };

    return (
      <div>
        <div style={{ marginBottom: 14 }}><span className="lnk" onClick={() => { setDetail(null); setText(""); }}>← 목록으로</span></div>
        <PageHead title={o.name} sub={`${o.year}차년도 수행기관 · 담당 ${db.managers[o.id].name} ${db.managers[o.id].title}`}
          right={<Badge s={s.status} />} />
        {s.status === "none" ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink3)" }}>
            아직 제출된 자료가 없습니다. 마감은 {REPORT_DUE}입니다.
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

  const rows = db.subs.filter((s) => (filter === "all" || s.status === filter) && orgOf(s.orgId).name.includes(q));

  return (
    <div>
      <PageHead title="자료 제출 · 검토" sub="중간보고서 제출부터 최종 승인까지, 모든 흐름을 한곳에서 확인하세요." />
      <div className="card">
        <div className="chd"><h3>기관별 제출 현황 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>중간보고서</span></h3>
          <span className="bg g-req" style={{ fontSize: 10.5 }}>제출 마감 09.18</span></div>
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

        <div style={{ display: "flex", borderTop: "1px solid var(--line2)", paddingTop: 14 }}>
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
  const [zoom, setZoom] = useState({});
  const T = CONSULT_TYPES.find((t) => t.key === type);

  const avail = db.avail.filter((a) => a.type === type);
  const confirms = db.confirms.filter((c) => c.type === type);
  const orgIds = [...new Set(avail.map((a) => a.orgId))];
  const countOn = (date) => confirms.filter((c) => c.date === date).length;

  const confirm = async (orgId) => {
    const date = pick[orgId] ?? confirms.find((c) => c.orgId === orgId)?.date
      ?? avail.find((a) => a.orgId === orgId)?.date;
    if (!date) { say("가능 일자가 없습니다."); return; }
    const already = confirms.find((c) => c.orgId === orgId);
    if (!already && countOn(date) >= CAP) {
      say(`${date.slice(5)}은(는) 정원 ${CAP}개 기관이 모두 찼습니다. 다른 일자를 선택해 주세요.`); return;
    }
    try {
      await run(sb.from("confirms").upsert({ org_id: orgId, type, date: iso(date) }));
      await run(sb.from("alerts").insert({ org_id: orgId, text: `${T.label} 일정이 ${date.slice(5).replace(".", "월 ")}일로 확정되었습니다.` }));
      await log("컨설팅 일정 확정", `${orgOf(orgId).name} · ${T.label} ${date.slice(5)}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say(`확정했습니다 — ${orgOf(orgId).name} · ${date.slice(5)}`);
  };

  const saveZoom = async (orgId) => {
    const url = (zoom[orgId] ?? db.confirms.find((c) => c.orgId === orgId && c.type === type)?.zoom ?? "").trim();
    if (!url) { say("Zoom 링크를 입력해 주세요."); return; }
    if (!/^https?:\/\//.test(url)) { say("http:// 또는 https:// 로 시작하는 주소를 입력해 주세요."); return; }
    const mgr = db.managers[orgId];
    const r = await fetch("/api/zoom", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, type, zoom: url }) }).then((x) => x.json());
    if (r.error) { say(`처리 실패: ${r.error}`); return; }
    if (r.ok) await run(sb.from("alerts").insert({ org_id: orgId, text: `${T.label} Zoom 링크가 등록되었습니다. 담당자 이메일로 안내가 발송되었습니다.` }));
    await log(r.ok ? "Zoom 링크 등록 · 메일 발송" : "안내 메일 발송 실패", `${orgOf(orgId).name} → ${mgr.email}`);
    reload();
    say(r.ok ? `Zoom 링크를 저장하고 ${mgr.name} ${mgr.title}(${mgr.email})에게 안내를 발송했습니다.`
      : `Zoom 링크는 저장했지만 메일 발송에 실패했습니다 (${r.reason}). 재시도 버튼으로 다시 보낼 수 있습니다.`);
  };

  const retry = async (orgId) => {
    const r = await fetch("/api/zoom", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, type }) }).then((x) => x.json());
    if (r.ok) await log("안내 메일 재발송", `${orgOf(orgId).name}`);
    reload();
    say(r.ok ? "재발송했습니다." : `발송 실패: ${r.reason || r.error}`);
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub="기관이 체크한 가능 일자를 확인하고 최종 일정을 확정하세요." />

      <div className="tabs">
        {CONSULT_TYPES.map((t) => (
          <div key={t.key} className={`tb ${type === t.key ? "tb-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}{t.required && <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 6 }}>필수</span>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chd"><h3>{T.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{T.period}</span></h3>
          <span className="bg g-rev" style={{ fontSize: 10.5 }}>일자별 정원 {CAP}개 기관 · 1회 60분</span></div>
        <div style={{ display: "flex", gap: 10, padding: 16 }}>
          {T.dates.map((d) => {
            const n = countOn(d);
            return (
              <div key={d} className="card" style={{ flex: 1, padding: 12, background: n >= CAP ? "var(--gray)" : "#FCFDFF" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{Number(d.slice(8))}일</div>
                <div style={{ fontSize: 10.5, color: "var(--ink3)", marginBottom: 8 }}>{d.slice(0, 7)}</div>
                <div style={{ fontSize: 11, color: n >= CAP ? "var(--redT)" : "var(--ink2s)" }}>
                  확정 {n}/{CAP}{n >= CAP && " · 마감"}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 4 }}>
                  체크 {avail.filter((a) => a.date === d).length}개 기관
                </div>
                {confirms.filter((c) => c.date === d).map((c) => (
                  <div key={c.orgId} className="bg g-app" style={{ fontSize: 10, marginTop: 5, display: "block" }}>
                    {orgOf(c.orgId).name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="chd"><h3>기관별 일정 신청</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{orgIds.length}개 기관 신청 · {confirms.length}건 확정</span></div>
        <table>
          <thead><tr><th style={{ width: 110 }}>기관</th><th>가능 일자 (체크)</th><th style={{ width: 78 }}>상태</th>
            <th style={{ width: 150 }}>일정 확정</th><th style={{ width: 250 }}>Zoom 링크 / 안내 메일</th></tr></thead>
          <tbody>
            {orgIds.map((oid) => {
              const o = orgOf(oid);
              const ds = avail.filter((a) => a.orgId === oid).map((a) => a.date);
              const cf = confirms.find((c) => c.orgId === oid);
              const failed = db.mailFails.some((f) => f.orgId === oid);
              return (
                <tr key={oid}>
                  <td><b style={{ fontWeight: 500, color: cf ? "var(--greenT)" : "var(--ink)" }}>{o.name}</b></td>
                  <td style={{ fontSize: 11.5, color: "var(--brand2)" }}>
                    {ds.map((d) => <span key={d} className="bg g-rev" style={{ marginRight: 4, fontSize: 10.5 }}>
                      {Number(d.slice(8))}일</span>)}
                  </td>
                  <td>{cf ? <span className="bg g-app">확정</span> : <span className="bg g-rev">신청 완료</span>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <select style={{ width: 82, padding: "5px 7px" }} value={pick[oid] ?? cf?.date ?? ds[0]}
                        onChange={(e) => setPick({ ...pick, [oid]: e.target.value })}>
                        {ds.map((d) => <option key={d} value={d}>{Number(d.slice(8))}일</option>)}
                      </select>
                      <button className="b2 bs" onClick={() => confirm(oid)}>{cf ? "변경" : "확정"}</button>
                    </div>
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
        <div className="chd"><h3>컨설팅 사전 정보</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>기관이 컨설팅 전 작성 · {Object.keys(db.pre).length}개 기관 제출</span></div>
        {Object.keys(db.pre).length === 0
          ? <div style={{ padding: 30, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>제출된 사전 정보가 없습니다.</div>
          : Object.entries(db.pre).map(([oid, p]) => (
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
    </div>
  );
}

/* ═══════════ 컨설팅 — 기관 ═══════════ */

function OrgConsult({ db, reload, say, log, me }) {
  const [type, setType] = useState("h2");
  const T = CONSULT_TYPES.find((t) => t.key === type);
  const mine = db.avail.filter((a) => a.orgId === me.id && a.type === type).map((a) => a.date);
  const [picks, setPicks] = useState(mine);
  const cf = db.confirms.find((c) => c.orgId === me.id && c.type === type);
  const pre = db.pre[me.id] || { rate: "", progress: "", country: "", ask: "" };
  const [form, setForm] = useState(pre);
  const [errs, setErrs] = useState({});

  useEffect(() => {
    setPicks(db.avail.filter((a) => a.orgId === me.id && a.type === type).map((a) => a.date));
  }, [type, me.id]);

  const toggle = (d) => setPicks((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);

  const save = async () => {
    if (!picks.length) { say("가능한 일자를 최소 1개 이상 체크해 주세요."); return; }
    try {
      await run(sb.from("avail").delete().match({ org_id: me.id, type }));
      await run(sb.from("avail").insert(picks.map((date) => ({ org_id: me.id, type, date: iso(date) }))));
      await log("컨설팅 가능일자 제출", `${T.label} · ${picks.map((d) => d.slice(8)).join(", ")}일`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say("가능 일자를 제출했습니다. 사무국 확정 후 최종 일정이 안내됩니다.");
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
      await run(sb.from("pre").upsert({ org_id: me.id, rate: String(form.rate), progress: form.progress, country: form.country, ask: form.ask || "", at: new Date().toISOString() }));
    } catch (e) { say(`저장 실패: ${e.message}`); return; }
    reload();
    say("컨설팅 사전 정보를 저장했습니다. 전문가와 사무국이 열람합니다.");
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub="가능한 일자를 모두 체크해 주세요. 선착순이 아니며 사무국이 일괄 확정합니다." />

      <div className="tabs">
        {CONSULT_TYPES.map((t) => (
          <div key={t.key} className={`tb ${type === t.key ? "tb-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}{t.required && <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 6 }}>필수</span>}
          </div>
        ))}
      </div>

      {cf ? (
        <div className="card" style={{ padding: 22, marginBottom: 16, background: "var(--green)", borderColor: "#C6E3D2" }}>
          <div style={{ fontSize: 11.5, color: "var(--greenT)" }}>{T.label} 일정이 확정되었습니다</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--greenT)", marginTop: 4 }}>
            {cf.date.slice(5).replace(".", "월 ")}일
          </div>
          <div style={{ fontSize: 12, color: "var(--greenT)", marginTop: 6 }}>
            1회 60분 · 온라인 · {cf.zoom
              ? <>Zoom 링크 <a href={cf.zoom} target="_blank" rel="noreferrer" style={{ color: "var(--greenT)" }}>{cf.zoom}</a></>
              : "Zoom 링크는 확정 후 담당자 이메일로 발송됩니다."}
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>{T.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{T.period}</span></h3>
              <span className="bg g-rev" style={{ fontSize: 10.5 }}>가능한 일자를 모두 체크</span></div>
            <div style={{ display: "flex", gap: 10, padding: 16 }}>
              {T.dates.map((d) => {
                const full = db.confirms.filter((c) => c.type === type && c.date === d).length >= CAP;
                const on = picks.includes(d);
                return (
                  <div key={d} className={`dsel ${on ? "dsel-on" : ""} ${full ? "dsel-full" : ""}`}
                    style={{ flex: 1 }} onClick={() => !full && toggle(d)}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{Number(d.slice(8))}</div>
                    <div style={{ fontSize: 10.5 }}>{full ? "마감" : on ? "가능 ✓" : "선택"}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "0 16px 14px", fontSize: 11.5, color: "var(--ink2s)" }}>
              여러 일자를 체크할수록 조율이 쉬워집니다. 정원이 찬 일자는 선택할 수 없습니다.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <button className="b1" onClick={save}>가능 일자 제출</button>
            <span style={{ fontSize: 11.5, color: "var(--ink2s)" }}>
              {picks.length}개 선택됨{mine.length ? " · 기존 제출 내역을 덮어씁니다" : ""}</span>
          </div>
        </>
      )}

      <div className="card">
        <div className="chd"><h3>컨설팅 사전 정보</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>
            {db.pre[me.id] ? `최근 저장 ${db.pre[me.id].at}` : "컨설팅 전 미리 작성해 주세요"}</span></div>
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
        </div>
      </div>
    </div>
  );
}

/* ═══════════ 예산변경 / 사업변경 — 기관 ═══════════ */

function OrgBudget({ db, reload, say, log, me }) {
  const [tab, setTab] = useState("inner");
  const rows = db.budgets[me.id] || [];
  const [f, setF] = useState({ round: "", date: "", docNo: "", level: "세세목", item: "",
    beforeBasis: "", beforeAmt: "", afterBasis: "", afterAmt: "", reason: "",
    newItem: false, cross: false, plan: false });
  const [errs, setErrs] = useState({});

  const diff = (r) => Number(r.afterAmt) - Number(r.beforeAmt);
  const cum = rows.reduce((a, r) => a + Math.max(0, diff(r)), 0);
  const newDiff = (Number(f.afterAmt) || 0) - (Number(f.beforeAmt) || 0);
  const projCum = cum + Math.max(0, newDiff);

  const triggers = [];
  if (projCum > APPROVAL_THRESHOLD) triggers.push(`예산변경 누적금액이 1천만원을 초과합니다 (${won(projCum)}원)`);
  if (f.cross) triggers.push("목(세목) 간 전용이 발생합니다");
  if (f.newItem) triggers.push("신규 세목·세세목이 추가됩니다");
  if (f.plan) triggers.push("국내/현지 예산계획 자체가 변경됩니다");

  const add = async () => {
    const e = {};
    if (!f.round) e.round = "차수를 입력해 주세요.";
    if (!f.date.trim()) e.date = "내부 변경일을 입력해 주세요.";
    if (!f.docNo.trim()) e.docNo = "내부기안 문서번호를 입력해 주세요.";
    if (!f.item.trim()) e.item = "변경 대상 항목을 입력해 주세요.";
    if (f.beforeAmt === "" || isNaN(Number(f.beforeAmt))) e.beforeAmt = "변경 전 금액을 숫자로 입력해 주세요.";
    if (f.afterAmt === "" || isNaN(Number(f.afterAmt))) e.afterAmt = "변경 후 금액을 숫자로 입력해 주세요.";
    if (!f.reason.trim()) e.reason = "변경 사유는 필수 입력입니다.";
    setErrs(e);
    if (Object.keys(e).length) { say("입력하지 않은 필수 항목이 있습니다."); return; }
    if (triggers.length) { say("승인이 필요한 변경입니다. 아래 안내를 확인하고 승인 문서를 제출해 주세요."); return; }
    try {
      await run(sb.from("budgets").insert({ org_id: me.id, round: Number(f.round), date: f.date.trim(), doc_no: f.docNo.trim(), level: f.level,
        item: f.item.trim(), before_basis: f.beforeBasis, before_amt: Number(f.beforeAmt), after_basis: f.afterBasis, after_amt: Number(f.afterAmt),
        reason: f.reason.trim(), new_item: f.newItem, cross_item: f.cross, plan: f.plan }));
    } catch (e) { say(`저장 실패: ${e.message}`); return; }
    reload();
    setF({ round: "", date: "", docNo: "", level: "세세목", item: "", beforeBasis: "", beforeAmt: "",
      afterBasis: "", afterAmt: "", reason: "", newItem: false, cross: false, plan: false });
    say("내부 예산변경 내역을 등록했습니다. 승인 절차 없이 즉시 반영됩니다.");
  };

  const del = (id) => run(sb.from("budgets").delete().eq("id", id)).then(reload).catch((e) => say(`삭제 실패: ${e.message}`));

  const myDocs = db.docs.filter((d) => d.orgId === me.id);

  const upload = async (kind, files, reason) => {
    try {
      const [f0] = await uploadFiles(`org-${me.id}/docs`, files);
      await run(sb.from("docs").insert({ org_id: me.id, kind, name: f0.n, size: f0.s, path: f0.path, reason }));
      await log(kind === "budget" ? "예산변경 승인 신청" : "사업변경 승인 신청", f0.n);
    } catch (e) { say(`제출 실패: ${e.message}`); throw e; }
    reload();
    say("승인 신청 문서를 제출했습니다. 사무국 검토 후 결과가 안내됩니다.");
  };

  return (
    <div>
      <PageHead title="예산변경 / 사업변경" sub="기관 내부 변경은 직접 입력하고, 승인이 필요한 변경은 문서로 제출합니다." />

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
            내부 결재로 처리하는 예산변경입니다. 사무국 승인 없이 기관이 직접 입력·수정합니다.
            증감내역과 누적금액은 금액 입력 시 자동 계산됩니다.
          </div>

          <div className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
            <div className="chd"><h3>내부 예산변경 내역</h3>
              <span style={{ fontSize: 11.5 }}>누적 <b className="mono" style={{ color: cum > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>
                {won(cum)}</b>원 / 1천만원</span></div>
            <table style={{ minWidth: 900 }}>
              <thead><tr><th>차수</th><th>내부 변경일</th><th>문서번호</th><th>구분</th><th>변경 전</th><th>변경 후</th>
                <th style={{ textAlign: "right" }}>증감내역</th><th style={{ textAlign: "right" }}>누적금액</th><th>사유</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const d2 = diff(r);
                  const run = rows.slice(0, i + 1).reduce((a, x) => a + Math.max(0, diff(x)), 0);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.round}차</td>
                      <td className="mono" style={{ color: "var(--ink2s)" }}>{r.date}</td>
                      <td className="mono" style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{r.docNo}</td>
                      <td><span className="bg g-not">{r.level}</span>
                        <div style={{ fontSize: 11, color: "var(--ink2s)", marginTop: 3 }}>{r.item}</div></td>
                      <td style={{ fontSize: 11.5 }}>{r.beforeBasis}
                        <div className="mono" style={{ color: "var(--ink2s)" }}>{won(r.beforeAmt)}원</div></td>
                      <td style={{ fontSize: 11.5 }}>{r.afterBasis}
                        <div className="mono" style={{ color: "var(--ink2s)" }}>{won(r.afterAmt)}원</div></td>
                      <td className="mono" style={{ textAlign: "right", color: d2 > 0 ? "var(--greenT)" : d2 < 0 ? "var(--redT)" : "var(--ink3)" }}>
                        {d2 > 0 ? "+" : ""}{won(d2)}</td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--ink2s)" }}>{won(run)}</td>
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
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 80 }}><label className="lbl">차수</label>
                <input className={errs.round ? "err" : ""} value={f.round} onChange={(e) => setF({ ...f, round: e.target.value })} placeholder="3" /></div>
              <div style={{ width: 130 }}><label className="lbl">내부 변경일</label>
                <input className={errs.date ? "err" : ""} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} placeholder="2026.09.10" /></div>
              <div style={{ width: 160 }}><label className="lbl">문서번호 (내부기안)</label>
                <input className={errs.docNo ? "err" : ""} value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} placeholder="기관-2026-052" /></div>
              <div style={{ width: 100 }}><label className="lbl">구분</label>
                <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
                  {BUDGET_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></div>
              <div style={{ flex: 1 }}><label className="lbl">변경 대상 항목</label>
                <input className={errs.item ? "err" : ""} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}
                  placeholder="사업비 &gt; 교육운영비 &gt; 강사료" /></div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}><label className="lbl">변경 전 산출근거</label>
                <input value={f.beforeBasis} onChange={(e) => setF({ ...f, beforeBasis: e.target.value })} placeholder="50,000원 × 20회" /></div>
              <div style={{ width: 140 }}><label className="lbl">변경 전 금액</label>
                <input className={errs.beforeAmt ? "err" : ""} value={f.beforeAmt}
                  onChange={(e) => setF({ ...f, beforeAmt: e.target.value.replace(/[^0-9]/g, "") })} placeholder="1000000" /></div>
              <div style={{ flex: 1 }}><label className="lbl">변경 후 산출근거</label>
                <input value={f.afterBasis} onChange={(e) => setF({ ...f, afterBasis: e.target.value })} placeholder="50,000원 × 26회" /></div>
              <div style={{ width: 140 }}><label className="lbl">변경 후 금액</label>
                <input className={errs.afterAmt ? "err" : ""} value={f.afterAmt}
                  onChange={(e) => setF({ ...f, afterAmt: e.target.value.replace(/[^0-9]/g, "") })} placeholder="1300000" /></div>
            </div>

            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 12px",
              background: "#FAFBFE", borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: "var(--ink2s)" }}>자동 계산</span>
              <span>증감내역 <b className="mono" style={{ color: newDiff > 0 ? "var(--greenT)" : newDiff < 0 ? "var(--redT)" : "var(--ink3)" }}>
                {newDiff > 0 ? "+" : ""}{won(newDiff)}원</b></span>
              <span>예산변경 누적금액 <b className="mono" style={{ color: projCum > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>
                {won(projCum)}원</b></span>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 12 }}>
              {[["cross", "목(세목) 간 전용"], ["newItem", "신규 세목·세세목 추가"], ["plan", "국내/현지 예산계획 변경"]].map(([k, l]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
                  {l}
                </label>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}><label className="lbl">변경 사유</label>
              <input className={errs.reason ? "err" : ""} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}
                placeholder="교육 회차 확대에 따른 강사료 증액" />
              {errs.reason && <div className="errmsg">{errs.reason}</div>}</div>

            {triggers.length > 0 && (
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

            <button className="b1" onClick={add} disabled={triggers.length > 0}>내역 추가</button>
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chd"><h3>제출 문서</h3></div>
            <table>
              <thead><tr><th>구분</th><th>문서</th><th>변경 사유</th><th>제출일</th><th>상태</th></tr></thead>
              <tbody>
                {myDocs.map((d) => (
                  <tr key={d.id}>
                    <td><span className="bg g-sub">{d.kind === "budget" ? "예산변경" : "사업변경"}</span></td>
                    <td>{d.name}<span className="mono" style={{ color: "var(--ink3)", marginLeft: 7 }}>{mb(d.size)}</span></td>
                    <td style={{ color: "var(--ink2s)" }}>{d.reason}</td>
                    <td className="mono" style={{ color: "var(--ink3)" }}>{d.at}</td>
                    <td>{d.status === "approved"
                      ? <><span className="bg g-app">승인</span>
                        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 3 }}>{d.approvedAt} · {d.by}</div></>
                      : <span className="bg g-req">승인 대기</span>}</td>
                  </tr>
                ))}
                {!myDocs.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>
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
  const [err, setErr] = useState("");
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13.5 }}>승인 신청 문서 제출</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 150 }}><label className="lbl">구분</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="budget">예산변경</option><option value="project">사업변경</option></select></div>
        <div style={{ flex: 1 }}><label className="lbl">변경 사유 (요약)</label>
          <input className={err ? "err" : ""} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="목 간 전용 발생 (사업비 → 인건비 3,200,000원)" />
          {err && <div className="errmsg">{err}</div>}</div>
      </div>
      <Uploader label="승인 신청 제출"
        onDone={async (files) => {
          if (!reason.trim()) { setErr("변경 사유를 입력해 주세요."); throw new Error("reason"); }
          setErr(""); await onUpload(kind, files, reason.trim()); setReason("");
        }} />
    </div>
  );
}

/* ═══════════ 예산변경 / 사업변경 — 관리자 ═══════════ */

function AdminBudget({ db, reload, say, log, who }) {
  const [tab, setTab] = useState("pending");
  const list = db.docs.filter((d) => tab === "pending" ? d.status === "pending" : d.status === "approved");
  const [memo, setMemo] = useState({});

  const approve = async (doc) => {
    try {
      await run(sb.from("docs").update({ status: "approved", approved_by: who, approved_at: new Date().toISOString(), memo: memo[doc.id] || "" }).eq("id", doc.id));
      await run(sb.from("alerts").insert({ org_id: doc.orgId, text: `${doc.kind === "budget" ? "예산변경" : "사업변경"} 신청 문서가 승인 처리되었습니다.` }));
      await log(doc.kind === "budget" ? "예산변경 승인" : "사업변경 승인", `${orgOf(doc.orgId).name} · ${doc.name}`);
    } catch (e) { say(`처리 실패: ${e.message}`); return; }
    reload();
    say(`승인 처리했습니다. ${orgOf(doc.orgId).name}에 알림이 전달됩니다.`);
  };

  const innerRows = Object.entries(db.budgets).map(([oid, rows]) => {
    const cum = rows.reduce((a, r) => a + Math.max(0, Number(r.afterAmt) - Number(r.beforeAmt)), 0);
    return { oid: Number(oid), n: rows.length, cum };
  });

  return (
    <div>
      <PageHead title="예산변경 / 사업변경" sub="기관이 제출한 승인 신청 문서를 검토하고 승인 처리하세요." />

      <div className="tabs">
        <div className={`tb ${tab === "pending" ? "tb-on" : ""}`} onClick={() => setTab("pending")}>
          승인 대기 <span className="bg g-req" style={{ fontSize: 9.5, marginLeft: 5 }}>
            {db.docs.filter((d) => d.status === "pending").length}</span></div>
        <div className={`tb ${tab === "done" ? "tb-on" : ""}`} onClick={() => setTab("done")}>승인 완료</div>
        <div className={`tb ${tab === "inner" ? "tb-on" : ""}`} onClick={() => setTab("inner")}>기관 내부 변경 현황</div>
      </div>

      {tab === "inner" ? (
        <div className="card">
          <div className="chd"><h3>기관별 내부 예산변경 누적</h3>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>1천만원 초과 시 승인 대상</span></div>
          <table>
            <thead><tr><th>기관</th><th>변경 건수</th><th style={{ textAlign: "right" }}>누적금액</th><th>비고</th></tr></thead>
            <tbody>
              {innerRows.map((r) => (
                <tr key={r.oid}>
                  <td><b style={{ fontWeight: 500 }}>{orgOf(r.oid).name}</b></td>
                  <td className="mono">{r.n}건</td>
                  <td className="mono" style={{ textAlign: "right", color: r.cum > APPROVAL_THRESHOLD ? "var(--redT)" : "var(--ink)" }}>
                    {won(r.cum)}원</td>
                  <td>{r.cum > APPROVAL_THRESHOLD
                    ? <span className="bg g-red">한도 초과 · 승인 필요</span>
                    : <span className="bg g-not">한도 내</span>}</td>
                </tr>
              ))}
              {!innerRows.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--ink3)" }}>
                내부 예산변경을 입력한 기관이 없습니다.</td></tr>}
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
  const [orgId, setOrgId] = useState(db.subs[0]?.orgId);
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
            {db.subs.map((s) => <option key={s.orgId} value={s.orgId}>{orgOf(s.orgId).name}</option>)}
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

function ExpertConsult({ db, reload, say, me }) {
  const [zoom, setZoom] = useState({});
  const rows = db.confirms.slice().sort((a, b) => a.date.localeCompare(b.date));

  const save = async (c) => {
    const url = (zoom[`${c.orgId}-${c.type}`] ?? c.zoom).trim();
    if (url && !/^https?:\/\//.test(url)) { say("http:// 또는 https:// 로 시작하는 주소를 입력해 주세요."); return; }
    try { await run(sb.from("confirms").update({ zoom: url }).match({ org_id: c.orgId, type: c.type })); }
    catch (e) { say(`저장 실패: ${e.message}`); return; }
    reload();
    say("비고를 저장했습니다. 기관 화면과 사무국 화면에 동일하게 반영됩니다.");
  };

  return (
    <div>
      <PageHead title="컨설팅 일정" sub="사무국이 확정한 최종 일정만 표시됩니다. 미확정 일정은 노출되지 않습니다." />

      <div className="card">
        <div className="chd"><h3>확정 컨설팅 일정</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{rows.length}건 · 1회 60분</span></div>
        <table>
          <thead><tr><th style={{ width: 110 }}>일자</th><th style={{ width: 140 }}>구분</th><th>기관</th>
            <th style={{ width: 150 }}>기관 담당자</th><th style={{ width: 280 }}>비고 (Zoom 링크)</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const T = CONSULT_TYPES.find((t) => t.key === c.type);
              const m = db.managers[c.orgId];
              const k = `${c.orgId}-${c.type}`;
              return (
                <tr key={k}>
                  <td className="mono"><b>{c.date.slice(5)}</b></td>
                  <td><span className="bg g-rev" style={{ fontSize: 10.5 }}>{T.label}</span></td>
                  <td><b style={{ fontWeight: 500 }}>{orgOf(c.orgId).name}</b>
                    {db.pre[c.orgId] && <div style={{ fontSize: 10.5, color: "var(--brand2)" }}>
                      사전 정보 제출됨 · 집행률 {db.pre[c.orgId].rate}%</div>}</td>
                  <td style={{ fontSize: 11.5, color: "var(--ink2s)" }}>{m.name} {m.title}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={{ padding: "5px 8px", fontSize: 11 }} placeholder="https://zoom.us/j/..."
                        value={zoom[k] ?? c.zoom} onChange={(e) => setZoom({ ...zoom, [k]: e.target.value })} />
                      <button className="b2 bs" onClick={() => save(c)}>저장</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 36, color: "var(--ink3)" }}>
              확정된 컨설팅 일정이 없습니다. 사무국 확정 후 표시됩니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="chd"><h3>컨설팅 사전 정보</h3>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>기관이 컨설팅 전 작성한 내용</span></div>
        {Object.keys(db.pre).length === 0
          ? <div style={{ padding: 30, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>제출된 사전 정보가 없습니다.</div>
          : Object.entries(db.pre).map(([oid, p]) => (
            <div key={oid} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <b>{orgOf(Number(oid)).name}</b>
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

function OrgDash({ db, reload, say, go, me }) {
  const s = db.subs.find((x) => x.orgId === me.id);
  const mgr = db.managers[me.id];
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(mgr);
  const [errs, setErrs] = useState({});
  const cf = db.confirms.find((c) => c.orgId === me.id);
  const todo = ["none", "revision"].includes(s.status);
  const lastFb = [...s.feedbacks].reverse().find((f) => f.severity === "req");
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
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
          <span className="bg g-req" style={{ fontSize: 10.5 }}>
            {s.status === "revision" ? `수정 마감 ${s.dueFix?.slice(5)}` : `제출 마감 ${REPORT_DUE.slice(5)}`}</span></div>
        {!todo ? (
          <div style={{ padding: 26, textAlign: "center", background: "var(--green)", color: "var(--greenT)", fontSize: 12.5 }}>
            {s.status === "approved" ? "중간보고서가 최종 승인되었습니다. 지금 제출할 자료는 없습니다."
              : "제출이 완료되어 사무국이 검토하고 있습니다."}
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{CUR_YEAR} 중간보고서</div>
                <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 2 }}>
                  사업 추진 현황 및 예산 집행 내역 · {s.status === "revision" ? `수정 마감 ${s.dueFix}` : `제출 마감 ${REPORT_DUE}`}
                </div>
              </div>
              <button className="b1" onClick={() => go("submit")}>
                {s.status === "revision" ? "수정본 올리기" : "제출하기"}</button>
            </div>
            {lastFb && s.status === "revision" && (
              <div className="note" style={{ background: "var(--amber)", color: "#6B4A0D", marginTop: 13 }}>
                <div style={{ fontSize: 10.5, color: "var(--amberT)", marginBottom: 4 }}>
                  {lastFb.author} · {lastFb.at} · v{lastFb.v}에 대한 수정 요청</div>
                {lastFb.content}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div className="card" style={{ flex: 1, padding: 16 }}>
          <h3 style={{ margin: "0 0 11px", fontSize: 13.5 }}>컨설팅</h3>
          {cf ? (
            <>
              <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: "var(--greenT)" }}>
                {cf.date.slice(5).replace(".", "월 ")}일</div>
              <div style={{ fontSize: 11.5, color: "var(--ink2s)", marginTop: 4 }}>
                {CONSULT_TYPES.find((t) => t.key === cf.type).label} · 1회 60분<br />
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
          {s.versions.length === 0
            ? <div style={{ fontSize: 11.5, color: "var(--ink3)" }}>아직 제출한 자료가 없습니다.</div>
            : [...s.versions].reverse().map((v) => (
              <div key={v.no} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <b className="mono" style={{ color: "var(--brand2)" }}>v{v.no}</b>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink3)" }}>{v.at}</span>
                  {v.final && <span className="bg g-app" style={{ fontSize: 9.5 }}>최종본</span>}
                </div>
              </div>
            ))}
          <button className="b2" style={{ width: "100%", marginTop: 8 }} onClick={() => go("submit")}>자료 제출 →</button>
        </div>
      </div>
    </div>
  );
}

function OrgSubmit({ db, reload, say, log, me }) {
  const s = db.subs.find((x) => x.orgId === me.id);
  const [note, setNote] = useState(""); const [reply, setReply] = useState({}); const [err, setErr] = useState("");
  const isFix = s.status === "revision";
  const lastFb = [...s.feedbacks].reverse().find((f) => f.severity === "req");
  const locked = ["submitted", "reviewing", "approved"].includes(s.status);

  const submit = async (files) => {
    if (isFix && !note.trim()) { setErr("변경 사항 메모는 필수 입력입니다."); say("변경 사항을 입력해야 재제출할 수 있습니다."); return; }
    setErr("");
    const no = (s.versions[s.versions.length - 1]?.no || 0) + 1;
    try {
      const meta = await uploadFiles(`org-${me.id}/v${no}`, files);
      await run(sb.from("versions").insert({ org_id: me.id, no, note: note.trim(), files: meta }));
      await run(sb.from("submissions").upsert({ org_id: me.id, status: "submitted", due_fix: null }));
      await log("자료 제출", `중간보고서 v${no}`);
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
      <PageHead title="자료 제출" sub={`${CUR_YEAR} 중간보고서 · 제출 마감 ${REPORT_DUE}`} right={<Badge s={s.status} />} />

      {locked ? (
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

function Archive({ db, say, log }) {
  const rows = db.subs.filter((s) => s.status === "approved");
  const total = rows.reduce((a, s) => a + s.versions.filter((v) => v.final)
    .reduce((x, v) => x + v.files.reduce((y, f) => y + f.s, 0), 0), 0);
  return (
    <div>
      <PageHead title="최종 자료실" sub="사무국이 최종 승인한 버전만 모았습니다." />
      <div className="card">
        <div className="chd">
          <h3>승인된 중간보고서 <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--ink3)" }}>{rows.length}개 기관</span></h3>
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

function OrgsPage({ db, setDetail, go }) {
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
              const s = db.subs.find((x) => x.orgId === o.id);
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
                    <Badge s={s.status} />
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
        <div style={{ display: "flex", gap: 12 }}>
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

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
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

const CTA_PAGES = [["", "버튼 없음"], ["submit", "자료 제출"], ["consult", "컨설팅 일정"], ["budget", "예산변경 / 사업변경"], ["annual", "연간 사업 일정"]];
const newKey = (p) => `${p}${Date.now().toString(36)}`;

function Settings({ db, reload, say, log }) {
  const init = () => {
    const c = currentSettings();
    return { ...c,
      consult_types: c.consult_types.map((t) => ({ ...t, dates: t.dates.join(", ") })),
      notices: c.notices.map((n) => ({ t: n.t, d: n.d, body: n.body.join("\n\n"), ctaLabel: n.cta?.[0] || "", ctaPage: n.cta?.[1] || "" })) };
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const up = (k, v) => setF({ ...f, [k]: v });
  const upRow = (k, i, patch) => up(k, f[k].map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const delRow = (k, i) => up(k, f[k].filter((_, j) => j !== i));
  const usedTypes = new Set([...db.avail.map((a) => a.type), ...db.confirms.map((c) => c.type)]);
  const usedReports = new Set(db.reports.map((r) => r.type));
  const D = /^\d{4}\.\d{2}\.\d{2}$/;

  const save = async () => {
    const e = [];
    if (!f.program.trim()) e.push("사업명");
    if (!D.test(f.report_due)) e.push("중간보고서 마감 (YYYY.MM.DD)");
    f.consult_types.forEach((t, i) => { if (!t.label.trim()) e.push(`컨설팅 ${i + 1} 이름`);
      t.dates.split(",").map((s) => s.trim()).filter(Boolean).forEach((d) => { if (!D.test(d)) e.push(`컨설팅 ${i + 1} 일자 "${d}"`); }); });
    f.expert_reports.forEach((r, i) => { if (!r.label.trim()) e.push(`전문가 보고서 ${i + 1} 이름`); if (!D.test(r.due)) e.push(`전문가 보고서 ${i + 1} 마감`); });
    f.notices.forEach((n, i) => { if (!n.t.trim()) e.push(`공지 ${i + 1} 제목`); });
    if (e.length) { say(`확인 필요: ${e.slice(0, 3).join(", ")}${e.length > 3 ? " 외" : ""}`); return; }
    const data = {
      program: f.program.trim(), team: f.team.trim(), program_year: Number(f.program_year), report_due: f.report_due,
      fix_days: Number(f.fix_days) || 7, cap: Number(f.cap) || 2,
      consult_types: f.consult_types.map((t) => ({ key: t.key, label: t.label.trim(), period: t.period.trim(), required: !!t.required,
        dates: t.dates.split(",").map((s) => s.trim()).filter(Boolean).sort() })),
      expert_reports: f.expert_reports.map((r) => ({ key: r.key, label: r.label.trim(), due: r.due })),
      notices: f.notices.map((n) => ({ t: n.t.trim(), d: n.d, by: f.team.trim(), body: n.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
        cta: n.ctaPage ? [n.ctaLabel || "바로가기 →", n.ctaPage] : null })),
    };
    setBusy(true);
    try {
      await run(sb.from("settings").upsert({ id: 1, data, updated_at: new Date().toISOString() }));
      await log("사업 설정 변경", data.program);
    } catch (err) { say(`저장 실패: ${err.message}`); setBusy(false); return; }
    await reload(); setBusy(false); say("저장했습니다. 모든 화면에 바로 반영됩니다.");
  };

  const IN = (props) => <input style={{ padding: "6px 9px" }} {...props} />;

  return (
    <div>
      <PageHead title="사업 설정" sub="사업명, 마감일, 컨설팅 회차, 공지사항을 여기서 바꿉니다. 저장하면 기관·전문가 화면에 즉시 반영됩니다."
        right={<button className="b1" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>} />

      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 13.5 }}>기본 정보</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label className="lbl">사업명</label><IN value={f.program} onChange={(e) => up("program", e.target.value)} /></div>
          <div><label className="lbl">운영 부서명 (문구·메일 서명)</label><IN value={f.team} onChange={(e) => up("team", e.target.value)} /></div>
          <div><label className="lbl">사업연도 (이 해에 선발된 기관 = 1차년도)</label><IN type="number" value={f.program_year} onChange={(e) => up("program_year", e.target.value)} /></div>
          <div><label className="lbl">중간보고서 제출 마감 (YYYY.MM.DD)</label><IN value={f.report_due} onChange={(e) => up("report_due", e.target.value)} /></div>
          <div><label className="lbl">수정 요청 시 부여 기한 (일)</label><IN type="number" value={f.fix_days} onChange={(e) => up("fix_days", e.target.value)} /></div>
          <div><label className="lbl">컨설팅 일자별 확정 정원 (기관 수)</label><IN type="number" value={f.cap} onChange={(e) => up("cap", e.target.value)} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chd"><h3>컨설팅 회차</h3>
          <button className="b2 bs" onClick={() => up("consult_types", [...f.consult_types, { key: newKey("c"), label: "", period: "", required: true, dates: "" }])}>+ 회차 추가</button></div>
        <table>
          <thead><tr><th style={{ width: 200 }}>이름</th><th style={{ width: 170 }}>기간 표시</th><th>가능 일자 (쉼표로 구분, YYYY.MM.DD)</th><th style={{ width: 60 }}>필수</th><th style={{ width: 70 }} /></tr></thead>
          <tbody>
            {f.consult_types.map((t, i) => (
              <tr key={t.key}>
                <td><IN value={t.label} placeholder="하반기 필수컨설팅" onChange={(e) => upRow("consult_types", i, { label: e.target.value })} /></td>
                <td><IN value={t.period} placeholder="2027.09.21 – 09.25" onChange={(e) => upRow("consult_types", i, { period: e.target.value })} /></td>
                <td><IN value={t.dates} placeholder="2027.09.21, 2027.09.22" onChange={(e) => upRow("consult_types", i, { dates: e.target.value })} /></td>
                <td style={{ textAlign: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={!!t.required} onChange={(e) => upRow("consult_types", i, { required: e.target.checked })} /></td>
                <td style={{ textAlign: "right" }}>
                  {usedTypes.has(t.key) ? <span style={{ fontSize: 10.5, color: "var(--ink3)" }}>신청 있음</span>
                    : <button className="b2 bs" onClick={() => delRow("consult_types", i)}>삭제</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--ink3)", borderTop: "1px solid var(--line2)" }}>
          기관이 이미 가능 일자를 신청한 회차는 삭제할 수 없습니다. 일자를 줄이면 그 일자의 신청 내역은 화면에서 사라집니다.
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

      <div className="card">
        <div className="chd"><h3>공지사항</h3>
          <button className="b2 bs" onClick={() => up("notices", [{ t: "", d: TODAY, body: "", ctaLabel: "", ctaPage: "" }, ...f.notices])}>+ 공지 추가</button></div>
        {f.notices.length === 0 && <div style={{ padding: 26, textAlign: "center", color: "var(--ink3)", fontSize: 12 }}>등록된 공지가 없습니다.</div>}
        {f.notices.map((n, i) => (
          <div key={i} style={{ padding: 16, borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <IN value={n.t} placeholder="제목" onChange={(e) => upRow("notices", i, { t: e.target.value })} />
              <IN style={{ width: 130, padding: "6px 9px" }} value={n.d} placeholder="2027.03.02" onChange={(e) => upRow("notices", i, { d: e.target.value })} />
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
