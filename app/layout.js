import "./globals.css";
import "./portal.css";

export const metadata = { title: "이음 · NGO 파트너스 포털", description: "2026 지역사회 변화지원 사업관리 포털" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" /></head>
      <body>{children}</body>
    </html>
  );
}
