export default function AdminPage() {
  return (
    <main className="subpage">
      <div className="page-kicker">사감 관리용</div>
      <div className="admin-title-row">
        <div><h1>호실 배정 현황</h1><p className="page-lead">학생 신청 현황과 배정 결과를 확인하고 조정하는 관리자 화면의 뼈대입니다.</p></div>
        <span className="lock-mark">관리자 인증 연결 예정</span>
      </div>

      <section className="summary-grid" aria-label="신청 및 배정 요약">
        <article><span>전체 신청</span><strong>—명</strong><small>DB 조회 연결 예정</small></article>
        <article><span>배정 완료</span><strong>—명</strong><small>4~5차시 구현 예정</small></article>
        <article><span>미배정</span><strong>—명</strong><small>4~5차시 구현 예정</small></article>
      </section>

      <section className="admin-board">
        <div className="filter-row">
          <label><span>학년</span><select disabled><option>전체</option></select></label>
          <label><span>배정 상태</span><select disabled><option>전체</option></select></label>
          <label className="search-field"><span>학생 검색</span><input disabled placeholder="학번 또는 이름" /></label>
          <button disabled>검색</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>동</th><th>호실</th><th>학년</th><th>학생 1</th><th>학생 2</th><th>유사도</th><th>상태</th><th>수동 조정</th></tr></thead>
            <tbody><tr><td colSpan={8}><div className="empty-table"><strong>배정 데이터 연결 전입니다</strong><span>현재 차시는 화면 구조만 완성합니다. 저장 데이터 조회와 배정 기능은 이후 차시에 연결합니다.</span></div></td></tr></tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
