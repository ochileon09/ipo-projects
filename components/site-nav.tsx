"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/student", label: "학생 신청" },
  { href: "/admin", label: "사감 관리" },
];

export function SiteNav() {
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
    <nav className="site-nav" aria-label="주요 화면">
      <Link className="brand" href="/">ROOMFIT</Link>
      <div className="nav-actions">
        <div className="nav-links">
        {links.map((link) => (
          <Link
            className={pathname === link.href ? "active" : ""}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
        </div>
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "light" ? "다크 테마로 변경" : "라이트 테마로 변경"} title={theme === "light" ? "다크 테마" : "라이트 테마"}>
          <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          <b>{theme === "light" ? "다크" : "라이트"}</b>
        </button>
      </div>
    </nav>
  );
}
