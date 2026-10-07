import Link from "next/link";

export default function StartPage() {
  return (
    <main className="dashboard-page">
      <header className="dashboard-heading">
        <div><p className="eyebrow">DORM ROOMMATE MATCHING</p><h1>기숙사 호실 배정</h1><p>생활 습관 설문부터 호실별 학생 확인까지 한곳에서 관리합니다.</p></div>
        <span className="project-badge">3차시 프로젝트</span>
      </header>

      <section className="dashboard-alert" aria-label="서비스 안내">
        <span aria-hidden="true">✦</span>
        <div><strong>생활 습관을 반영한 기숙사 배정 서비스</strong><p>학생은 설문을 제출하고, 관리자는 신청 현황과 층별 호실 지도를 확인할 수 있습니다.</p></div>
        <small>ROOMFIT GUIDE</small>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-main-card">
          <div className="card-title-row"><div><p className="eyebrow">QUICK MENU</p><h2>서비스 바로가기</h2></div><span>전체 보기</span></div>
          <div className="quick-menu-grid">
            <Link href="/student"><span className="quick-icon">✓</span><small>STUDENT</small><strong>학생 설문 신청</strong><p>생활 패턴과 룸메이트 선호를 입력합니다.</p><b>신청하기 →</b></Link>
            <Link href="/admin"><span className="quick-icon">⌂</span><small>MANAGER</small><strong>기숙사 배정 관리</strong><p>정원·호실·학생 배정 현황을 관리합니다.</p><b>관리 화면 →</b></Link>
          </div>
        </section>

        <aside className="dashboard-card dashboard-highlight">
          <span>ROOMFIT</span>
          <strong>더 잘 맞는<br />룸메이트 찾기</strong>
          <p>생활 시간, 정리 습관, 소음 민감도와 선호 온도를 함께 살펴봅니다.</p>
          <i aria-hidden="true">R</i>
        </aside>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-card process-card">
          <div className="card-title-row"><div><p className="eyebrow">PROCESS</p><h2>이용 순서</h2></div></div>
          <ol><li><span>1</span><div><strong>설문 작성</strong><p>학생 기본 정보와 생활 습관을 입력합니다.</p></div></li><li><span>2</span><div><strong>데이터 저장</strong><p>제출한 응답을 데이터베이스에 안전하게 저장합니다.</p></div></li><li><span>3</span><div><strong>호실 확인</strong><p>관리 화면에서 층별 배정 상태를 확인합니다.</p></div></li></ol>
        </section>
        <section className="dashboard-card status-card">
          <div className="card-title-row"><div><p className="eyebrow">PROJECT STATUS</p><h2>현재 구현 현황</h2></div></div>
          <div className="status-list"><span><b>설문 DB 저장</b><i>완료</i></span><span><b>테스트 데이터 생성</b><i>완료</i></span><span><b>층별 호실 지도</b><i>완료</i></span><span><b>관리자 인증키 설정</b><i className="pending">협의 예정</i></span></div>
        </section>
      </div>
    </main>
  );
}
