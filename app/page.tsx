import Link from "next/link";
import { Icon } from "@/components/icon";
import { DormitoryOverview } from "@/components/dormitory-overview";

export default function StartPage() {
  return <main className="start-page">
    <header className="page-title"><div><h1>기숙사 배정</h1><p className="start-intro">같은 학년·확인된 성별 안에서 생활 습관을 고려해 배정하고, 검토 후 최종 확정합니다.</p></div><Link className="help-link" href="/help">사용 방법 <Icon name="help" size={17} /></Link></header>
    <div className="start-actions">
      <Link href="/student"><Icon name="survey" size={24} /><div><h2>학생 설문</h2><p>생활 습관 입력·수정</p></div><Icon name="arrow" size={19} /></Link>
      <Link href="/admin"><Icon name="building" size={24} /><div><h2>배정 관리</h2><p>호실 배정 확인·조정</p></div><Icon name="arrow" size={19} /></Link>
    </div>
    <p className="result-entry"><Link href="/result">내 배정 결과 · 호환 점수와 이유 확인 →</Link></p>
    <DormitoryOverview />
  </main>;
}
