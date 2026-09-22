// 사업 설정. 아래 값은 기본값이고, 관리자 화면 "사업 설정"(settings 테이블)에 저장된 값이 있으면 applySettings() 로 덮어쓴다.
// export let + 재할당 = ES 모듈 live binding 이라 import 한 쪽에서도 바뀐 값이 보인다.
export let PROGRAM = "2027 국제나눔 파트너십 지원사업";
export let TEAM = "파트너십지원부";            // 운영 부서명 (화면 문구·메일 서명)
export let PROGRAM_YEAR = 2027;               // 사업연도. 차년도 계산 기준 (선발연도 = PROGRAM_YEAR → 1차년도)
export let CUR_YEAR = PROGRAM_YEAR;
// 기관이 제출하는 보고서 종류와 마감. key 는 DB(submissions.kind 등)에 저장되므로 바꾸지 말 것.
export let REPORTS = [
  { key: "mid", label: "중간보고서", start: "", due: "2026.09.18" },        // start 비우면 상시 제출 가능
  { key: "result", label: "결과보고서", start: "", due: "2026.11.13" },
  { key: "final", label: "최종 결과보고서", start: "", due: "2026.12.18" },
];
export let FIX_DAYS = 7;                      // 수정 요청 시 부여하는 기한(일)
export let CAP = 2;                           // 컨설팅 일자별 확정 정원
export const MAX_MB = process.env.NEXT_PUBLIC_R2 ? 200 : 50;   // Supabase 무료 저장소 50MB, R2 사용 시 200MB
export const APPROVAL_THRESHOLD = 10000000;
export const BUDGET_LEVELS = ["목", "세목", "세세목"];

// 컨설팅 회차. slots = 신청 가능한 일시 [{date:"YYYY.MM.DD", time:"HH:MM"}], time 이 빈 문자열이면 하루 단위.
const days = (ds) => ds.map((date) => ({ date, time: "" }));
export let CONSULT_TYPES = [
  { key: "h1", label: "상반기 필수컨설팅", required: true, slots: days(["2026.03.24", "2026.03.25", "2026.03.26", "2026.03.27"]) },
  { key: "h2", label: "하반기 필수컨설팅", required: true, slots: days(["2026.09.21", "2026.09.22", "2026.09.23", "2026.09.24", "2026.09.25"]) },
  { key: "opt", label: "선택컨설팅", required: false, mode: "apply", slots: [] },   // mode "apply" = 신청서 제출 → 사무국이 전문가·일시 배정
];

// 선택컨설팅 신청서 항목. kind: text | textarea | date. (희망 전문가 칸은 항상 붙는다)
// ponytail: 항목이 확정되면 여기만 바꾸면 됨. 화면 편집 UI 는 필요해질 때.
export const OPT_FIELDS = [
  { key: "topic", label: "컨설팅 희망 주제", kind: "text", required: true },
  { key: "background", label: "신청 배경 및 현재 상황", kind: "textarea", required: true },
  { key: "question", label: "구체적인 자문 요청 내용", kind: "textarea", required: true },
  { key: "when", label: "희망 시기", kind: "text" },
  { key: "attendees", label: "참석 예정자 (이름 · 직책)", kind: "text" },
];

export let EXPERT_REPORTS = [
  { key: "r1", label: "상반기 컨설팅 보고서", due: "2026.04.10" },
  { key: "r2", label: "하반기 컨설팅 보고서", due: "2026.10.10" },
  { key: "r3", label: "국내 현장점검 보고서", due: "2026.08.20" },
];

export let NOTICES = [
  { t: "중간보고서 제출 안내 및 작성 양식", d: "2026.09.01", by: TEAM,
    body: ["제출 마감은 2026년 9월 18일입니다. 기관별 사업 추진 실적과 예산 집행 내역을 정리하여 자료 제출 메뉴에서 제출해 주세요.",
      "관리자 검토 후 수정이 필요한 경우 제출 상세에 의견이 등록됩니다. 수정본을 제출할 때 변경 사항을 메모에 함께 남겨 주세요."],
    cta: ["자료 제출로 이동 →", "submit"] },
  { t: "하반기 필수컨설팅 가능 일자 신청 안내", d: "2026.09.07", by: TEAM,
    body: ["컨설팅은 9월 21일부터 25일까지 진행됩니다. 가능한 일자를 모두 체크해 주세요. 선착순이 아니며, 전체 접수 후 사무국이 일괄 확정합니다.",
      "확정 후에는 Zoom 링크가 담당자 이메일로 자동 발송됩니다. 기관 홈 화면 우측 상단의 담당자 정보를 최신으로 유지해 주세요."],
    cta: ["가능 일자 체크 →", "consult"] },
];

// 컨설팅 확정 안내 메일. 자리표시자는 발송 시 실제 값으로 바뀐다.
export const MAIL_VARS = ["{기관명}", "{담당자}", "{차년도}", "{회차}", "{일시}", "{링크}", "{부서}", "{사업명}"];
export let MAIL_SUBJECT = "[KCOC] {회차} 일정 및 Zoom 안내 ({일시})";
export let MAIL_BODY = `안녕하세요,
{기관명} {담당자}님,

KCOC 파트너십지원부 입니다.

2027년 국제나눔 파트너십지원사업({차년도}차년도) {회차} 일정이 {일시}로 확정되었습니다.
(120분 예상)

온라인 필수컨설팅 Zoom 링크: {링크}

일정에 참고 부탁드립니다.

{부서} 드림`;
export const fillMail = (tpl, v) => MAIL_VARS.reduce((t, k) => t.split(k).join(v[k] ?? ""), tpl);

// settings 테이블의 jsonb → 위 변수들에 반영. 화면 "사업 설정"이 저장하는 모양과 같다.
export function currentSettings() {
  return { program: PROGRAM, team: TEAM, program_year: PROGRAM_YEAR, reports: REPORTS, fix_days: FIX_DAYS, cap: CAP,
    consult_types: CONSULT_TYPES, expert_reports: EXPERT_REPORTS, notices: NOTICES, mail_subject: MAIL_SUBJECT, mail_body: MAIL_BODY };
}
export function applySettings(s) {
  if (!s) return;
  if (s.program) PROGRAM = s.program;
  if (s.team) TEAM = s.team;
  if (s.program_year) { PROGRAM_YEAR = Number(s.program_year); CUR_YEAR = PROGRAM_YEAR; }
  if (Array.isArray(s.reports) && s.reports.length) REPORTS = s.reports;
  else if (s.report_due) REPORTS = REPORTS.map((r, i) => (i === 0 ? { ...r, due: s.report_due } : r));
  if (s.fix_days) FIX_DAYS = Number(s.fix_days);
  if (s.cap) CAP = Number(s.cap);
  if (Array.isArray(s.consult_types) && s.consult_types.length)
    CONSULT_TYPES = s.consult_types.map((t) => ({ ...t, slots: t.slots || days(t.dates || []),
      mode: t.mode || (t.key === "opt" ? "apply" : "slots") }));   // 구버전(dates) 호환 · opt 는 신청서 방식 기본
  if (Array.isArray(s.expert_reports) && s.expert_reports.length) EXPERT_REPORTS = s.expert_reports;
  if (s.mail_subject) MAIL_SUBJECT = s.mail_subject;
  if (s.mail_body) MAIL_BODY = s.mail_body;
  if (Array.isArray(s.notices)) NOTICES = s.notices.map((n) => ({ ...n, by: n.by || TEAM }));
}

export const ST = {
  none: { label: "미제출", cls: "g-not" }, submitted: { label: "제출됨", cls: "g-sub" },
  reviewing: { label: "검토 중", cls: "g-rev" }, revision: { label: "수정 요청", cls: "g-req" },
  approved: { label: "최종 완료", cls: "g-app" },
};

export const CAT = {
  consult: { label: "컨설팅", color: "#3E63C4", bg: "g-rev" },
  monitor: { label: "모니터링", color: "#1D7A4E", bg: "g-app" },
  report: { label: "보고서 제출", color: "#5B45B5", bg: "g-sub" },
  deadline: { label: "제출 마감", color: "#A9720F", bg: "g-req" },
  etc: { label: "기타", color: "#6E7B95", bg: "g-not" },
};

// 날짜 표시: "2026.09.10"
export const fmt = (d) => { if (!d) return ""; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "."); const x = new Date(d); return isNaN(x) ? String(d).slice(0, 10).replaceAll("-", ".") :
  `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(x.getDate()).padStart(2, "0")}`; };
export const fmtT = (d) => { const x = new Date(d); return `${fmt(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
export const iso = (s) => s.replaceAll(".", "-");   // "2026.09.21" → "2026-09-21"
export const TODAY = fmt(new Date());
export const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
export const mb = (n) => `${Number(n).toFixed(1)}MB`;
