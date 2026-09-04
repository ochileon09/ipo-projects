import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정보과학 프로젝트",
  description: "Supabase와 연결된 정보과학 프로젝트",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
