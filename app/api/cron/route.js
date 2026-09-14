import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/server";

const TABLES = ["orgs", "profiles", "submissions", "versions", "feedbacks", "avail", "confirms", "pre", "budgets", "docs", "reports", "alerts", "logs", "roadmap"];
const KEEP_DAYS = 60;

// 매일 0시(vercel.json crons).
//  1) 무료 플랜 자동 정지 방지: 요청 한 번
//  2) DB 전체 + 계정 목록을 JSON 으로 덤프해 스토리지 'backups' 버킷에 저장, 60일 지난 것 삭제
//     (파일 본문은 백업하지 않음. 복원은 scripts/restore.mjs)
export async function GET(req) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const ping = await anon.from("roadmap").select("id").limit(1);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: !ping.error, backup: "skipped (no service key)" });

  const a = adminClient();
  const dump = { at: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    const { data, error } = await a.from(t).select("*");
    if (error) return NextResponse.json({ ok: false, table: t, error: error.message }, { status: 500 });
    dump.tables[t] = data;
  }
  const { data: users } = await a.auth.admin.listUsers({ perPage: 1000 });
  dump.users = (users?.users || []).map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }));
  const { data: files } = await a.storage.from("files").list("", { limit: 1000 });
  dump.files = files || [];

  await a.storage.createBucket("backups", { public: false }).catch(() => {});
  const name = `ieum-${dump.at.slice(0, 10)}.json`;
  const { error: upErr } = await a.storage.from("backups").upload(name, JSON.stringify(dump), { contentType: "application/json", upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const { data: old } = await a.storage.from("backups").list("");
  const stale = (old || []).filter((f) => new Date(f.created_at).getTime() < cutoff).map((f) => f.name);
  if (stale.length) await a.storage.from("backups").remove(stale);

  return NextResponse.json({ ok: !ping.error, backup: name, rows: Object.fromEntries(TABLES.map((t) => [t, dump.tables[t].length])), removed: stale.length });
}
