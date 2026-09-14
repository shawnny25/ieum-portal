import { NextResponse } from "next/server";
import { me, serverClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail";
import { CONSULT_TYPES, TEAM, PROGRAM, PROGRAM_YEAR, MAIL_SUBJECT, MAIL_BODY, fillMail, fmt, applySettings } from "@/lib/config";

// POST { orgId, type, zoom? }  zoom 생략 시 재발송
export async function POST(req) {
  const p = await me();
  if (p?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { orgId, type, zoom } = await req.json();
  const s = await serverClient();
  applySettings((await s.from("settings").select("data").eq("id", 1).maybeSingle()).data?.data);
  if (zoom !== undefined) await s.from("confirms").update({ zoom }).match({ org_id: orgId, type });
  const { data: c } = await s.from("confirms").select("*, orgs(*)").match({ org_id: orgId, type }).single();
  if (!c) return NextResponse.json({ error: "확정 일정이 없습니다." }, { status: 400 });

  const T = CONSULT_TYPES.find((t) => t.key === type);
  const v = {
    "{기관명}": c.orgs.name, "{담당자}": `${c.orgs.manager_name} ${c.orgs.manager_title}`.trim(),
    "{차년도}": String(PROGRAM_YEAR - c.orgs.picked + 1), "{회차}": T?.label || type,
    "{일시}": `${fmt(c.date)}${c.time ? " " + c.time : ""}`, "{링크}": c.zoom, "{부서}": TEAM, "{사업명}": PROGRAM,
  };
  const esc = (t) => t.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  const html = esc(fillMail(MAIL_BODY, v))
    .replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  const r = await sendMail({ to: c.orgs.manager_email, subject: fillMail(MAIL_SUBJECT, v),
    html: `<div style="font-size:14px;line-height:1.8">${html}</div>` });
  await s.from("confirms").update({ mailed_at: r.ok ? new Date().toISOString() : null, mail_failed: !r.ok }).match({ org_id: orgId, type });
  return NextResponse.json({ ok: r.ok, reason: r.reason, to: c.orgs.manager_email });
}
