// Sentry 오류 수집 공통 설정 (브라우저: instrumentation-client.js, 서버: instrumentation.js).
// 오류만 수집. 성능 추적·Replay 는 무료 한도와 개인정보 때문에 끔. DSN 은 공개값이라 코드에 둔다.
export const sentryOptions = {
  dsn: "https://b04ff2f01f1ee933678ee911a3479f06@o4512162685386752.ingest.de.sentry.io/4512162698231888",
  enabled: process.env.NODE_ENV === "production",   // 로컬 개발 중 오류는 보내지 않음
  sendDefaultPii: false,                             // IP·쿠키 등 사용자 정보 미전송
};
