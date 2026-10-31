"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { useAdminSession } from "@/components/admin-session";

const links = [
  { href: "/", label: "대시보드", icon: "dashboard" as IconName },
  { href: "/student", label: "학생 설문 신청", icon: "survey" as IconName },
  { href: "/admin", label: "기숙사 배정 관리", icon: "building" as IconName },
  { href: "/help", label: "도움말", icon: "help" as IconName },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const { adminKey, logout } = useAdminSession();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(currentTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    try { localStorage.setItem("roomfit-theme", nextTheme); } catch { /* 저장소를 사용할 수 없어도 테마는 전환합니다. */ }
    setTheme(nextTheme);
  }

  return (
    <div className="app-shell">
      <header className="shell-topbar">
        <Link className="brand" href="/" aria-label="ROOMFIT 홈">
          <span className="brand-mark"><Icon name="building" size={21} /></span>
          <span>roomfit<span className="brand-period">.</span></span>
        </Link>
        <div className="shell-top-actions">
          {adminKey && <button className="session-logout" type="button" onClick={logout}>로그아웃</button>}
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "light" ? "다크 테마로 변경" : "라이트 테마로 변경"} title={theme === "light" ? "다크 테마" : "라이트 테마"}>
            <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
            <b>{theme === "light" ? "다크" : "라이트"}</b>
          </button>
        </div>
      </header>

      <aside className="shell-sidebar">
        <nav aria-label="주요 화면">
          {links.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return <Link className={isActive ? "active" : ""} href={link.href} key={link.href} aria-current={isActive ? "page" : undefined}>
              <span><Icon name={link.icon} size={19} /></span>
              <b>{link.label}</b>
            </Link>;
          })}
        </nav>
      </aside>

      <div className="shell-page">
        {children}
      </div>
    </div>
  );
}
