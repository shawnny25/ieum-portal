// Resend REST 직접 호출. 키 없으면 미발송으로 리턴 (재시도 버튼으로 나중에 보냄).
export async function sendMail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: "RESEND_API_KEY 미설정" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "이음 포털 <onboarding@resend.dev>", to, subject, html }),
  });
  return r.ok ? { ok: true } : { ok: false, reason: await r.text() };
}
