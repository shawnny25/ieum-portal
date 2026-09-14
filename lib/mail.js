import nodemailer from "nodemailer";

// 발송 경로: SMTP (SMTP_USER + SMTP_PASS, 호스트 기본 smtp.gmail.com) → Resend (RESEND_API_KEY) → 미설정.
// 미설정이면 {ok:false} 로 돌려서 화면에 "발송 실패 · 재시도" 로 남긴다.
export async function sendMail({ to, subject, html }) {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER, pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    const port = Number(process.env.SMTP_PORT || 465);
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } });
    try {
      await t.sendMail({ from: process.env.MAIL_FROM || `이음 포털 <${user}>`, to, subject, html });
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message }; }
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "이음 포털 <onboarding@resend.dev>", to, subject, html }),
    });
    return r.ok ? { ok: true } : { ok: false, reason: await r.text() };
  }
  return { ok: false, reason: "메일 발송 미설정 (SMTP_USER / SMTP_PASS)" };
}
