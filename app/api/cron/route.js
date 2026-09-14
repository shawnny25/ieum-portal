import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase 무료 플랜은 7일간 요청이 없으면 프로젝트가 정지된다. 하루 한 번 건드려서 막는다 (vercel.json crons).
export async function GET() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await sb.from("roadmap").select("id").limit(1);
  return NextResponse.json({ ok: !error, at: new Date().toISOString(), error: error?.message });
}
