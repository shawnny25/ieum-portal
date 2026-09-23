import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverClient, adminClient } from "@/lib/supabase/server";

// DELETE { id, password } — 기관 삭제. 관리자 본인 비밀번호를 서버에서 다시 확인한다.
// 제출·예산·컨설팅 등 기관 데이터는 DB 에서 연쇄 삭제, 그 기관의 계정도 함께 삭제.
export async function DELETE(req) {
  const s = await serverClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: p } = await s.from("profiles").select("role,name").eq("id", user.id).single();
  if (p?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, password } = await req.json();
  if (!id || !password) return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });

  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: pe } = await check.auth.signInWithPassword({ email: user.email, password });
  if (pe) return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });

  const a = adminClient();
  const { data: org } = await a.from("orgs").select("name,picked").eq("id", id).single();
  if (!org) return NextResponse.json({ error: "기관을 찾을 수 없습니다." }, { status: 404 });
  // 기관이 없는 기관 계정은 쓸모가 없으므로 함께 삭제
  const { data: accts } = await a.from("profiles").select("id").eq("org_id", id);
  for (const { id: uid } of accts || []) {
    const { error: ue } = await a.auth.admin.deleteUser(uid);
    if (ue) return NextResponse.json({ error: `기관 계정 삭제 실패: ${ue.message}` }, { status: 400 });
  }
  const { error } = await a.from("orgs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await a.from("logs").insert({ who: `관리자 · ${p.name}`, action: "기관 삭제",
    target: `${org.name} · ${org.picked}년 선발${accts?.length ? ` · 기관 계정 ${accts.length}개 함께 삭제` : ""}` });
  return NextResponse.json({ ok: true });
}
