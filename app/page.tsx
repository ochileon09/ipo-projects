import Link from "next/link";
import { Icon } from "@/components/icon";

export default function StartPage() {
  return (
    <main className="dashboard-page">
      <header className="dashboard-heading">
        <div><p className="eyebrow">YOUR DORM, YOUR RHYTHM</p><h1>좋은 하루는,<br className="mobile-break" /> 편안한 방에서.</h1><p>나의 생활 리듬을 나누고, 함께 지낼 룸메이트를 만나보세요.</p></div>
        <span className="project-badge"><Icon name="building" size={15} /> 우리 학교 기숙사</span>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-main-card">
          <div className="card-title-row"><div><p className="eyebrow">GET STARTED</p><h2>어디서 시작할까요?</h2></div><span>학생 · 관리자</span></div>
          <div className="quick-menu-grid">
            <Link href="/student" className="student-menu"><span className="quick-icon"><Icon name="survey" size={24} /></span><small>FOR STUDENTS</small><strong>나의 생활 습관 입력</strong><p>취침 시간부터 방 안의 작은 습관까지.<br />나에게 편안한 생활을 알려주세요.</p><b>설문 작성하기 <Icon name="arrow" size={18} /></b></Link>
            <Link href="/admin" className="manager-menu"><span className="quick-icon"><Icon name="building" size={24} /></span><small>FOR MANAGERS</small><strong>기숙사 배정 관리</strong><p>학년별 정원과 호실을 설정하고<br />학생들의 배정 현황을 확인하세요.</p><b>관리 화면 열기 <Icon name="arrow" size={18} /></b></Link>
          </div>
        </section>

        <aside className="dashboard-card dashboard-highlight">
          <span><Icon name="sparkles" size={16} /> A BETTER FIT</span>
          <strong>비슷한 리듬,<br />여유 있는 아침.</strong>
          <p>수면 습관은 비슷하게,<br />씻는 시간은 겹치지 않게.<br />함께 지내는 순간을 생각합니다.</p>
          <div className="rhythm-art" aria-hidden="true"><div className="rhythm-room"><span>ROOM 301</span><div><i /><i /></div><b><Icon name="check" size={13} /> 잘 맞는 생활 리듬</b></div><div className="rhythm-time"><Icon name="sun" size={16} /><span>07:30</span><i /><Icon name="moon" size={16} /><span>00:30</span></div></div>
        </aside>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-card process-card">
          <div className="card-title-row"><div><p className="eyebrow">HOW IT WORKS</p><h2>세 단계로 이어지는 방 배정</h2></div></div>
          <ol><li><span>01</span><div><strong>생활 습관 작성</strong><p>평소의 시간과 선호를<br />설문으로 알려주세요.</p></div></li><li><span>02</span><div><strong>함께 살 조합 찾기</strong><p>학년과 생활 패턴을 고려해<br />룸메이트를 배정합니다.</p></div></li><li><span>03</span><div><strong>호실별 배정 확인</strong><p>관리자는 층별 지도에서<br />학생과 호실을 확인합니다.</p></div></li></ol>
        </section>
        <section className="dashboard-card status-card">
          <div className="card-title-row"><div><p className="eyebrow">THOUGHTFUL MATCHING</p><h2>생활을 고려한 기준</h2></div></div>
          <div className="status-list"><span><b>같은 학년끼리 배정</b><Icon name="check" size={17} /></span><span><b>실제 설문 응답 우선 반영</b><Icon name="check" size={17} /></span><span><b>씻는 시간의 겹침 고려</b><Icon name="check" size={17} /></span><span><b>미응답 학생도 기본값으로 배정</b><Icon name="check" size={17} /></span></div>
        </section>
      </div>
      <p className="dashboard-footnote">각자의 생활을 존중하는, 더 편안한 기숙사 생활.</p>
    </main>
  );
}
