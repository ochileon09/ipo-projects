"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type SurveyRow = {
  id: string;
  student_id: string;
  student_name: string;
  grade: number;
  wake_time: string;
  sleep_time: string;
  tidiness: number;
  noise_sensitivity: number;
  preferred_temperature: number;
  is_test: boolean;
  created_at: string;
};

export default function AdminPage() {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadSurveys = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("get_student_surveys_for_admin");
    if (error) {
      setErrorMessage(`DB 조회 실패: ${error.message}`);
      setSurveys([]);
    } else {
      setSurveys((data ?? []) as SurveyRow[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void loadSurveys(); }, [loadSurveys]);

  const testCount = surveys.filter((survey) => survey.is_test).length;

  return <main className="subpage">
    <div className="page-kicker">사감 관리용</div>
    <div className="admin-title-row">
      <div><h1>학생 설문 현황</h1><p className="page-lead">Supabase에 저장된 학생 생활 습관 설문을 확인합니다.</p></div>
      <button type="button" className="refresh-button" onClick={() => void loadSurveys()} disabled={isLoading}>{isLoading ? "불러오는 중..." : "새로고침"}</button>
    </div>

    {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}

    <section className="summary-grid" aria-label="신청 및 테스트 요약">
      <article><span>전체 신청</span><strong>{isLoading ? "—" : surveys.length}명</strong><small>DB에 저장된 설문</small></article>
      <article><span>테스트 학생</span><strong>{isLoading ? "—" : testCount}명</strong><small>2인실 {Math.floor(testCount / 2)}개 분량</small></article>
      <article><span>실제 신청</span><strong>{isLoading ? "—" : surveys.length - testCount}명</strong><small>테스트 표시 제외</small></article>
    </section>

    <section className="admin-board">
      <div className="board-heading"><div><h2>저장된 설문 목록</h2><p>최근 제출된 순서로 표시됩니다.</p></div><span>{surveys.length}건</span></div>
      <div className="table-wrap">
        <table className="survey-table">
          <thead><tr><th>구분</th><th>학번</th><th>이름</th><th>학년</th><th>기상</th><th>취침</th><th>정리</th><th>소음</th><th>온도</th><th>제출 시각</th></tr></thead>
          <tbody>
            {!isLoading && surveys.map((survey) => <tr key={survey.id}>
              <td><span className={survey.is_test ? "test-badge" : "live-badge"}>{survey.is_test ? "테스트" : "실제"}</span></td>
              <td>{survey.student_id}</td><td><strong>{survey.student_name}</strong></td><td>{survey.grade}학년</td>
              <td>{survey.wake_time.slice(0, 5)}</td><td>{survey.sleep_time.slice(0, 5)}</td>
              <td>{survey.tidiness}/5</td><td>{survey.noise_sensitivity}/5</td><td>{survey.preferred_temperature}℃</td>
              <td>{new Date(survey.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
            </tr>)}
            {!isLoading && surveys.length === 0 && !errorMessage && <tr><td colSpan={10}><div className="empty-table"><strong>저장된 설문이 없습니다</strong><span>학생 신청 화면에서 설문을 제출하거나 테스트 모드를 실행해 주세요.</span></div></td></tr>}
            {isLoading && <tr><td colSpan={10}><div className="empty-table"><strong>DB에서 설문을 불러오는 중입니다</strong></div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </main>;
}
