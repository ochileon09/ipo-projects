import Link from "next/link";
import type { Metadata } from "next";
import { HelpGuide } from "@/components/help-guide";

export const metadata: Metadata = { title: "도움말 | ROOMFIT" };

export default function HelpPage() {
  return <main className="help-page">
    <header className="page-title"><h1>도움말</h1><Link className="help-link" href="/">홈으로</Link></header>
    <HelpGuide />
  </main>;
}
