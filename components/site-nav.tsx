"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/student", label: "학생 신청" },
  { href: "/admin", label: "사감 관리" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="주요 화면">
      <Link className="brand" href="/">ROOMFIT</Link>
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
    </nav>
  );
}
