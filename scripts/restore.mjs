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

// FK 순서: orgs → profiles → 나머지
const ORDER = ["orgs", "profiles", "submissions", "versions", "feedbacks", "avail", "confirms", "pre", "budgets", "docs", "reports", "alerts", "logs", "roadmap"];
const PK = { submissions: "org_id", avail: "org_id,type,date", confirms: "org_id,type", pre: "org_id" };
for (const t of ORDER) {
  const rows = dump.tables[t] || [];
  if (!rows.length) continue;
  const { error } = await a.from(t).upsert(rows, { onConflict: PK[t] || "id" });
  console.log(t, rows.length, error ? "실패: " + error.message : "완료");
}
console.log("계정 목록(수동 확인용):", dump.users.map((u) => u.email).join(", "));
