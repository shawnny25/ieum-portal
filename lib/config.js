// 사업 고정 설정. 연도별로 여기만 바꾸면 됨.
export const PROGRAM = "2026 지역사회 변화지원";
export const CUR_YEAR = new Date().getFullYear();
export const REPORT_DUE = "2026.09.18";      // 중간보고서 제출 마감
export const FIX_DAYS = 7;                    // 수정 요청 시 부여하는 기한(일)
export const CAP = 2;                         // 컨설팅 일자별 확정 정원
export const MAX_MB = 50;                     // ponytail: Supabase 무료 플랜 파일 상한. Pro 전환 시 200으로
export const APPROVAL_THRESHOLD = 10000000;
export const BUDGET_LEVELS = ["목", "세목", "세세목"];

export const CONSULT_TYPES = [
  { key: "h1", label: "상반기 필수컨설팅", period: "2026.03.24 – 03.27", required: true,
    dates: ["2026.03.24", "2026.03.25", "2026.03.26", "2026.03.27"] },
  { key: "h2", label: "하반기 필수컨설팅", period: "2026.09.21 – 09.25", required: true,
    dates: ["2026.09.21", "2026.09.22", "2026.09.23", "2026.09.24", "2026.09.25"] },
  { key: "opt", label: "선택컨설팅", period: "2026.10.13 – 10.15", required: false,
    dates: ["2026.10.13", "2026.10.14", "2026.10.15"] },
];

export const EXPERT_REPORTS = [
  { key: "r1", label: "상반기 컨설팅 보고서", due: "2026.04.10" },
  { key: "r2", label: "하반기 컨설팅 보고서", due: "2026.10.10" },
  { key: "r3", label: "국내 현장점검 보고서", due: "2026.08.20" },
];

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

export const NOTICES = [
  { t: "중간보고서 제출 안내 및 작성 양식", d: "2026.09.01", by: "사업운영팀",
    body: ["제출 마감은 2026년 9월 18일입니다. 기관별 사업 추진 실적과 예산 집행 내역을 정리하여 자료 제출 메뉴에서 제출해 주세요.",
      "관리자 검토 후 수정이 필요한 경우 제출 상세에 의견이 등록됩니다. 수정본을 제출할 때 변경 사항을 메모에 함께 남겨 주세요."],
    cta: ["자료 제출로 이동 →", "submit"] },
  { t: "하반기 필수컨설팅 가능 일자 신청 안내", d: "2026.09.07", by: "사업운영팀",
    body: ["컨설팅은 9월 21일부터 25일까지 진행됩니다. 가능한 일자를 모두 체크해 주세요. 선착순이 아니며, 전체 접수 후 사무국이 일괄 확정합니다.",
      "확정 후에는 Zoom 링크가 담당자 이메일로 자동 발송됩니다. 기관 홈 화면 우측 상단의 담당자 정보를 최신으로 유지해 주세요."],
    cta: ["가능 일자 체크 →", "consult"] },
];

// 날짜 표시: "2026.09.10"
export const fmt = (d) => { if (!d) return ""; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "."); const x = new Date(d); return isNaN(x) ? String(d).slice(0, 10).replaceAll("-", ".") :
  `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(x.getDate()).padStart(2, "0")}`; };
export const fmtT = (d) => { const x = new Date(d); return `${fmt(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
export const iso = (s) => s.replaceAll(".", "-");   // "2026.09.21" → "2026-09-21"
export const TODAY = fmt(new Date());
export const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
export const mb = (n) => `${Number(n).toFixed(1)}MB`;
