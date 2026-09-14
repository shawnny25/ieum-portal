import "./globals.css";
import "./portal.css";

export const metadata = { title: "이음 · NGO 파트너스 포털", description: "2027 국제나눔 파트너십 지원사업 사업관리 포털" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" /></head>
      <body>{children}</body>
    </html>
  );
}
