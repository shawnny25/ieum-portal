// 백업 JSON 복원. 실행: node --env-file=.env.local scripts/restore.mjs ieum-2026-09-14.json
// 스토리지 backups 버킷의 파일명을 넘기면 내려받아 테이블에 upsert 한다. 계정(auth.users)은 복원하지 않고 목록만 출력.
import { createClient } from "@supabase/supabase-js";

const [name] = process.argv.slice(2);
if (!name) { console.error("사용법: node --env-file=.env.local scripts/restore.mjs <백업파일명>"); process.exit(1); }
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: blob, error } = await a.storage.from("backups").download(name);
if (error) { console.error("다운로드 실패:", error.message); process.exit(1); }
const dump = JSON.parse(await blob.text());
console.log("백업 시각:", dump.at);

// 테이블별 기본키 (supabase/schema.sql 과 같아야 한다). 없으면 id.
const PK = { submissions: "org_id,kind", avail: "org_id,type,date,time", confirms: "org_id,type", pre: "org_id,type",
  settings: "id", expert_avail: "expert_id,type,date,time", expert_notes: "expert_id,type", consult_apps: "org_id,type" };
// FK 순서. orgs.expert_id ↔ profiles 가 서로 참조하므로 orgs 는 expert_id 를 비워 먼저 넣고, profiles 뒤에 다시 채운다.
// profiles 는 auth.users 를 참조하므로 계정이 살아 있는 DB 에서만 복원된다 (계정 자체는 백업되지 않음).
const ORDER = ["orgs", "profiles", "submissions", "versions", "feedbacks", "avail", "confirms", "pre", "budgets", "docs", "reports",
  "alerts", "logs", "roadmap", "settings", "expert_avail", "expert_notes", "consult_apps"];
const put = async (t, rows) => {
  const { error } = await a.from(t).upsert(rows, { onConflict: PK[t] || "id" });
  console.log(t, rows.length, error ? "실패: " + error.message : "완료");
};
for (const t of ORDER) {
  const rows = dump.tables[t] || [];
  if (!rows.length) continue;
  await put(t, t === "orgs" ? rows.map((r) => ({ ...r, expert_id: null })) : rows);
}
if (dump.tables.orgs?.length) await put("orgs", dump.tables.orgs);   // 담당 전문가 연결 복원
// ponytail: 빈 DB 에 복원하면 serial 시퀀스가 복원된 id 뒤로 가지 않는다. 그때는 SQL Editor 에서 id 테이블마다
//   select setval(pg_get_serial_sequence('테이블명', 'id'), (select max(id) from 테이블명));
console.log("계정 목록(수동 확인용):", dump.users.map((u) => u.email).join(", "));
