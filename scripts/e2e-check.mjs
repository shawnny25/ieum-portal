// 권한 모델 검증. 임시 기관·계정을 만들어 기관 권한으로 실제 API 를 호출하고 끝나면 지운다.
// 실행: node --env-file=.env.local scripts/e2e-check.mjs
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(SR, "SUPABASE_SERVICE_ROLE_KEY 필요");
const admin = createClient(URL, SR, { auth: { persistSession: false } });
const tag = randomBytes(3).toString("hex");
const cleanup = [];
const ok = (m) => console.log("  ✓", m);

try {
  // 1. 임시 기관 2개 (활성 / 만료), 임시 기관 계정 1개
  const { data: orgs } = await admin.from("orgs").insert([
    { name: `테스트기관-${tag}`, picked: new Date().getFullYear() },
    { name: `만료기관-${tag}`, picked: new Date().getFullYear() - 5 },
  ]).select();
  const [mine, other] = orgs;
  cleanup.push(() => admin.from("orgs").delete().in("id", [mine.id, other.id]));
  const email = `e2e-${tag}@example.com`, pw = randomBytes(12).toString("base64url");
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  assert(!ue, ue?.message);
  cleanup.push(() => admin.auth.admin.deleteUser(u.user.id));
  await admin.from("profiles").insert({ id: u.user.id, role: "org", org_id: mine.id, email });
  await admin.from("versions").insert({ org_id: other.id, kind: "mid", no: 1, files: [] });
  ok("임시 데이터 생성");

  // 2. 기관 계정으로 로그인
  const org = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: le } = await org.auth.signInWithPassword({ email, password: pw });
  assert(!le, le?.message); ok("기관 로그인");

  // 3. 읽기 격리
  const { data: v } = await org.from("versions").select("*");
  assert.equal(v.length, 0); ok("다른 기관 제출본 안 보임");
  const { data: pr } = await org.from("profiles").select("*");
  assert.equal(pr.length, 1); ok("프로필은 본인 것만");
  const { data: rm } = await org.from("roadmap").select("id");
  assert(rm.length > 0); ok("연간 일정은 읽힘");
  assert((await org.from("settings").select("id")).data.length === 1); ok("사업 설정 읽힘");
  assert((await org.from("settings").update({ data: { program: "x" } }).eq("id", 1)).error || (await admin.from("settings").select("data").eq("id", 1).single()).data.data.program !== "x"); ok("사업 설정은 못 바꿈");

  // 4. 쓰기 권한
  assert(!(await org.from("submissions").upsert({ org_id: mine.id, kind: "mid", status: "submitted" })).error); ok("본인 제출 상태 갱신");
  assert((await org.from("submissions").upsert({ org_id: mine.id, kind: "mid", status: "approved" })).error); ok("본인이 승인 상태로 못 바꿈");
  assert((await org.from("submissions").upsert({ org_id: other.id, kind: "mid", status: "submitted" })).error); ok("다른 기관 제출 못 건드림");
  assert(!(await org.from("versions").insert({ org_id: mine.id, kind: "result", no: 1, files: [] })).error); ok("본인 버전 추가");
  assert(!(await org.from("logs").insert({ who: "e2e", action: "test" })).error); ok("로그 기록");
  assert((await org.from("logs").select("*")).data.length === 0); ok("로그는 못 읽음");
  const { error: me } = await org.from("orgs").update({ manager_name: "홍길동" }).eq("id", mine.id);
  assert(!me, me?.message); ok("담당자 정보 수정");
  const { error: ne } = await org.from("orgs").update({ name: "이름바꾸기" }).eq("id", mine.id);
  assert(ne && /manager only/.test(ne.message), "기관명 변경이 막혀야 함: " + ne?.message); ok("기관명은 못 바꿈 (트리거)");
  assert((await org.from("orgs").update({ budget_year: 999 }).eq("id", mine.id)).error); ok("예산 총액은 기관이 못 바꿈");
  assert(!(await org.from("budgets").insert({ org_id: mine.id, round: 1, date: "2027.03.02", doc_no: "t", level: "세세목", item: "강사비", item_to: "다과비", before_amt: 100, after_amt: 50, reason: "e2e" })).error); ok("내부 예산변경(항목 전환) 등록");
  assert(!(await org.from("docs").insert({ org_id: mine.id, kind: "budget", name: "e2e.pdf", path: `org-${mine.id}/e2e.pdf`, reason: "e2e", amount: 3200000 })).error); ok("승인 문서(변경 금액) 등록");

  // 5. 스토리지 격리
  const blob = new Blob(["hello"], { type: "text/plain" });
  assert(!(await org.storage.from("files").upload(`org-${mine.id}/e2e.txt`, blob)).error); ok("본인 폴더 업로드");
  assert((await org.storage.from("files").upload(`org-${other.id}/e2e.txt`, blob)).error); ok("다른 기관 폴더 업로드 차단");
  assert((await org.storage.from("files").upload(`expert-x/e2e.txt`, blob)).error); ok("전문가 폴더 업로드 차단");
  cleanup.push(() => admin.storage.from("files").remove([`org-${mine.id}/e2e.txt`]));

  // 6. 이용기간 만료 기관 계정은 아무것도 못 함
  await admin.from("profiles").update({ org_id: other.id }).eq("id", u.user.id);
  const { data: s2 } = await org.from("submissions").select("*");
  assert.equal(s2.length, 0);
  assert((await org.from("avail").insert({ org_id: other.id, type: "h2", date: "2026-09-21", time: "10:00" })).error); ok("만료 기관은 읽기·쓰기 모두 차단");

  console.log("\n모든 검증 통과");
} finally {
  for (const f of cleanup.reverse()) { try { await f(); } catch (e) { console.error("정리 실패:", e.message); } }
  console.log("임시 데이터 삭제 완료");
}
