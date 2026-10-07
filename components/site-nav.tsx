"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

const links = [
  { href: "/", label: "대시보드", icon: "▦" },
  { href: "/student", label: "학생 설문 신청", icon: "✓" },
  { href: "/admin", label: "기숙사 배정 관리", icon: "⌂" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(currentTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("roomfit-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className="app-shell">
      <header className="shell-topbar">
        <Link className="brand" href="/" aria-label="ROOMFIT 홈">
          <span className="brand-mark">R</span>
          <span>ROOMFIT</span>
        </Link>
        <div className="shell-top-actions">
          <span className="service-state"><i />시스템 운영 중</span>
          <span className="notification-mark" aria-hidden="true">●</span>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "light" ? "다크 테마로 변경" : "라이트 테마로 변경"} title={theme === "light" ? "다크 테마" : "라이트 테마"}>
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            <b>{theme === "light" ? "다크" : "라이트"}</b>
          </button>
        </div>
      </header>

      <aside className="shell-sidebar">
        <nav aria-label="주요 화면">
          <p className="sidebar-label">서비스</p>
          {links.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return <Link className={isActive ? "active" : ""} href={link.href} key={link.href}>
              <span aria-hidden="true">{link.icon}</span>
              <b>{link.label}</b>
            </Link>;
          })}
          <p className="sidebar-label sidebar-label-secondary">안내</p>
          <div className="sidebar-static"><span aria-hidden="true">?</span><b>이용 안내</b></div>
          <div className="sidebar-static"><span aria-hidden="true">↻</span><b>업데이트 내역</b></div>
        </nav>
        <footer>
          <strong>ROOMFIT</strong>
          <span>기숙사 생활 습관 기반 호실 배정</span>
          <small>2026 정보과학 프로젝트</small>
        </footer>
      </aside>

      <div className="shell-page">
        {children}
      </div>
    </div>
  );
}
