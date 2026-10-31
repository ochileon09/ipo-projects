import Link from "next/link";
import { Icon } from "@/components/icon";

export default function StartPage() {
  return <main className="start-page">
    <header className="page-title"><h1>기숙사 배정</h1><Link className="help-link" href="/help">사용 방법 <Icon name="help" size={17} /></Link></header>
    <div className="start-actions">
      <Link href="/student"><Icon name="survey" size={24} /><div><h2>학생 설문</h2><p>생활 습관 입력·수정</p></div><Icon name="arrow" size={19} /></Link>
      <Link href="/admin"><Icon name="building" size={24} /><div><h2>배정 관리</h2><p>호실 배정 확인·조정</p></div><Icon name="arrow" size={19} /></Link>
    </div>
  </main>;
}
