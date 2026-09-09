import Link from "next/link";

export default function StartPage() {
  return (
    <main className="start-page">
      <section className="start-hero">
        <p className="eyebrow">DORM ROOMMATE MATCHING</p>
        <h1>기숙사 호실 배정<br />시스템</h1>
        <p className="start-lead">사용 목적에 맞는 화면을 선택하세요. 학생은 생활 습관 설문을 신청하고, 사감은 신청 및 배정 현황을 관리합니다.</p>
        <div className="role-grid">
          <Link className="role-card student-role" href="/student">
            <span className="role-number">01</span>
            <div><small>STUDENT</small><h2>학생으로 시작하기</h2><p>기본 정보와 생활 습관을 입력해 기숙사 호실 배정을 신청합니다.</p></div>
            <strong aria-hidden="true">들어가기</strong>
          </Link>
          <Link className="role-card admin-role" href="/admin">
            <span className="role-number">02</span>
            <div><small>MANAGER</small><h2>관리자로 시작하기</h2><p>학생 신청 현황과 호실 배정표를 확인하고 관리합니다.</p></div>
            <strong aria-hidden="true">들어가기</strong>
          </Link>
        </div>
      </section>
    </main>
  );
}
