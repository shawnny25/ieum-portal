import { sb } from "./supabase/client";
import { CUR_YEAR, fmt, fmtT } from "./config";

// DB 전체를 화면이 쓰는 모양으로 조립. RLS 가 역할별로 걸러주므로 클라이언트는 그냥 다 읽는다.
// ponytail: 40여 명·20개 기관 규모라 전량 로드. 수백 기관이 되면 화면별 쿼리로 쪼갤 것.
export async function loadDb() {
  const q = (t, order = "id") => sb.from(t).select("*").order(order).then((r) => { if (r.error) throw r.error; return r.data; });
  const [orgsRaw, profiles, subsRaw, versions, feedbacks, availRaw, confirmsRaw, preRaw, budgetsRaw, docs, reports, alerts, logs, roadmapRaw] =
    await Promise.all([q("orgs"), q("profiles"), q("submissions", "org_id"), q("versions"), q("feedbacks"), q("avail", "date"),
      q("confirms", "date"), q("pre", "org_id"), q("budgets"), q("docs"), q("reports"), q("alerts"), q("logs"), q("roadmap", "m")]);

  const orgs = orgsRaw.map((o) => ({ id: o.id, name: o.name, ini: o.name[0], picked: o.picked,
    year: CUR_YEAR - o.picked + 1, ended: CUR_YEAR > o.picked + 2 }))
    .sort((a, b) => a.year - b.year || a.id - b.id);
  const managers = Object.fromEntries(orgsRaw.map((o) => [o.id, { name: o.manager_name, title: o.manager_title, email: o.manager_email }]));

  const subs = orgs.filter((o) => !o.ended).map((o) => {
    const s = subsRaw.find((x) => x.org_id === o.id);
    return { id: o.id, orgId: o.id, status: s?.status || "none", dueFix: s?.due_fix ? fmt(s.due_fix) : null,
      versions: versions.filter((v) => v.org_id === o.id).sort((a, b) => a.no - b.no)
        .map((v) => ({ no: v.no, at: fmt(v.at), note: v.note, files: v.files, final: v.final })),
      feedbacks: feedbacks.filter((f) => f.org_id === o.id)
        .map((f) => ({ id: f.id, v: f.v, at: fmt(f.at), author: f.author, severity: f.severity, content: f.content, reply: f.reply })) };
  });

  const confirms = confirmsRaw.map((c) => ({ orgId: c.org_id, type: c.type, date: fmt(c.date), zoom: c.zoom,
    mailedAt: c.mailed_at ? `${fmtT(c.mailed_at)} 발송` : null, mailFailed: c.mail_failed }));
  const roadmap = { 1: [], 2: [], 3: [] };
  roadmapRaw.forEach((r) => roadmap[r.year].push([r.m, r.when, r.title, r.cat, r.id]));

  return {
    orgs, managers, subs, confirms, profiles,
    experts: profiles.filter((p) => p.role === "expert").map((p) => ({ id: p.id, name: p.name, title: p.title, ini: p.name[0] || "전" })),
    avail: availRaw.map((a) => ({ orgId: a.org_id, type: a.type, date: fmt(a.date) })),
    pre: Object.fromEntries(preRaw.map((p) => [p.org_id, { rate: p.rate, progress: p.progress, country: p.country, ask: p.ask, at: fmt(p.at) }])),
    budgets: budgetsRaw.reduce((acc, b) => { (acc[b.org_id] ||= []).push({ id: b.id, round: b.round, date: b.date, docNo: b.doc_no,
      level: b.level, item: b.item, beforeBasis: b.before_basis, beforeAmt: b.before_amt, afterBasis: b.after_basis, afterAmt: b.after_amt,
      reason: b.reason, newItem: b.new_item, cross: b.cross_item, plan: b.plan }); return acc; }, {}),
    docs: docs.map((d) => ({ id: d.id, orgId: d.org_id, kind: d.kind, name: d.name, size: d.size, path: d.path, at: fmt(d.at),
      status: d.status, reason: d.reason, by: d.approved_by, approvedAt: d.approved_at ? fmt(d.approved_at) : null, memo: d.memo })),
    reports: reports.map((r) => ({ id: r.id, expertId: r.expert_id, type: r.type, orgId: r.org_id, name: r.name, size: r.size, path: r.path, at: fmt(r.at) })),
    alerts: alerts.map((a) => ({ id: a.id, orgId: a.org_id, text: a.text, at: fmt(a.at), read: a.read })),
    logs: logs.slice().reverse().map((l) => ({ at: fmtT(l.at), who: l.who, action: l.action, target: l.target })),
    roadmap,
    mailFails: confirms.filter((c) => c.mailFailed).map((c) => ({ orgId: c.orgId })),
  };
}

// 에러를 던지는 짧은 래퍼. 화면에서는 try/catch 로 say() 처리.
export async function run(query) { const { data, error } = await query; if (error) throw error; return data; }

// 파일 업로드 → [{n, s, path}]. R2 가 설정되어 있으면 서명 URL 로 직접 올리고 path 에 "r2:" 접두어를 남긴다.
// R2 미설정(503)이면 Supabase 저장소로 폴백.
const signed = (body) => fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json()) }));

export async function uploadFiles(prefix, files) {
  const out = [];
  for (const f of files) {
    const path = `${prefix}/${Date.now()}-${f.name}`;
    const r = await signed({ op: "put", path, contentType: f.type || "application/octet-stream" });
    if (r.status === 503) {
      const { error } = await sb.storage.from("files").upload(path, f);
      if (error) throw error;
      out.push({ n: f.name, s: f.size / 1048576, path });
      continue;
    }
    if (r.error) throw new Error(r.error);
    const up = await fetch(r.url, { method: "PUT", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
    if (!up.ok) throw new Error(`업로드 실패 (${up.status})`);
    out.push({ n: f.name, s: f.size / 1048576, path: `r2:${path}` });
  }
  return out;
}

export async function download(path, name) {
  if (path.startsWith("r2:")) {
    const r = await signed({ op: "get", path: path.slice(3), name });
    if (r.error) throw new Error(r.error);
    window.open(r.url, "_blank"); return;
  }
  const { data, error } = await sb.storage.from("files").createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank");
}
