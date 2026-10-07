import type { Metadata } from "next";
import { SiteShell } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "기숙사 룸메이트 배정",
  description: "생활 습관을 반영한 기숙사 룸메이트 배정 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var saved=localStorage.getItem('roomfit-theme');document.documentElement.dataset.theme=saved||'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();` }} />
      </head>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
