// SMTP 발송 테스트. 실행: node --env-file=.env.local scripts/mail-test.mjs [받는주소]
import { sendMail } from "../lib/mail.js";
const to = process.argv[2] || process.env.SMTP_USER;
const r = await sendMail({ to, subject: "[이음 포털] 메일 발송 테스트", html: "<p>이 메일이 보이면 SMTP 설정이 정상입니다.</p>" });
console.log(r.ok ? `발송 성공 → ${to}` : `발송 실패: ${r.reason}`);
