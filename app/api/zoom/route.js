import { NextResponse } from "next/server";
import { me, serverClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail";
import { CONSULT_TYPES, TEAM, fmt, applySettings } from "@/lib/config";

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
  const r = await sendMail({
    to: c.orgs.manager_email, subject: `[이음] ${T.label} 일정 및 Zoom 안내 (${fmt(c.date)}${c.time ? " " + c.time : ""})`,
    html: `<p>${c.orgs.name} ${c.orgs.manager_name} ${c.orgs.manager_title}님,</p>
<p>${T.label} 일정이 <b>${fmt(c.date)}${c.time ? " " + c.time : ""}</b>로 확정되었습니다. (1회 60분 · 온라인)</p>
<p>Zoom 링크: <a href="${c.zoom}">${c.zoom}</a></p><p>${TEAM} 드림</p>`,
  });
  await s.from("confirms").update({ mailed_at: r.ok ? new Date().toISOString() : null, mail_failed: !r.ok }).match({ org_id: orgId, type });
  return NextResponse.json({ ok: r.ok, reason: r.reason, to: c.orgs.manager_email });
}
