import { NextResponse } from "next/server";
import { me, adminClient } from "@/lib/supabase/server";

// POST { email, password, role, orgId?, name, title }
export async function POST(req) {
  const p = await me();
  if (p?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b.email || !b.password || !["admin", "org", "expert"].includes(b.role)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (b.role === "org" && !b.orgId) return NextResponse.json({ error: "기관을 선택해 주세요." }, { status: 400 });
  const a = adminClient();
  const { data, error } = await a.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { error: e2 } = await a.from("profiles").insert({ id: data.user.id, role: b.role, org_id: b.role === "org" ? b.orgId : null,
    name: b.name || "", title: b.title || "", email: b.email });
  if (e2) { await a.auth.admin.deleteUser(data.user.id); return NextResponse.json({ error: e2.message }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}

// DELETE { id }
export async function DELETE(req) {
  const p = await me();
  if (p?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await req.json();
  if (id === p.id) return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
  const { error } = await adminClient().auth.admin.deleteUser(id);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
