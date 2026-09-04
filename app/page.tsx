"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [connection, setConnection] = useState("연결 확인 중");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.auth.getSession();
      setConnection(error ? "연결 확인 필요" : "Supabase 연결됨");
    }
    void checkConnection();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("설문 화면 뼈대가 정상 작동합니다. 데이터 저장은 다음 차시에 연결합니다.");
  }

  return (
    <main>
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DORM ROOMMATE MATCHING</p>
          <h1>나와 잘 맞는<br />기숙사 룸메이트 찾기</h1>
          <p className="lead">생활 습관과 선호 조건을 입력하면 비슷한 학생끼리 호실을 배정하는 시스템입니다.</p>
        </div>
        <div className="hero-card" aria-label="개발 현황">
          <span className="status-dot" />
          <div><strong>{connection}</strong><p>2차시 · 설문 화면 뼈대 제작 중</p></div>
        </div>
      </header>

      <form className="survey" onSubmit={handleSubmit}>
        <section className="form-section">
          <div className="section-heading"><span>01</span><div><h2>학생 기본 정보</h2><p>배정 결과를 구분하기 위한 기본 정보입니다.</p></div></div>
          <div className="grid three-columns">
            <label>학번<input name="studentId" placeholder="예: 2602" /></label>
            <label>이름<input name="name" placeholder="이름 입력" /></label>
            <label>학년<select name="grade" defaultValue=""><option value="" disabled>선택</option><option>1학년</option><option>2학년</option><option>3학년</option></select></label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading"><span>02</span><div><h2>생활 리듬</h2><p>평소 기숙사에서의 시간을 기준으로 입력하세요.</p></div></div>
          <div className="grid two-columns">
            <label>평균 기상 시간<input type="time" name="wakeTime" defaultValue="07:00" /></label>
            <label>평균 취침 시간<input type="time" name="sleepTime" defaultValue="23:30" /></label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading"><span>03</span><div><h2>생활 습관과 선호</h2><p>각 항목에서 자신과 가장 가까운 정도를 선택하세요.</p></div></div>
          <div className="grid two-columns">
            <label>정리정돈 습관<select name="tidiness" defaultValue=""><option value="" disabled>선택</option><option>매우 깔끔하게 유지</option><option>보통</option><option>크게 신경 쓰지 않음</option></select></label>
            <label>소음 민감도<select name="noise" defaultValue=""><option value="" disabled>선택</option><option>작은 소리에도 민감함</option><option>보통</option><option>소음에 둔감함</option></select></label>
            <label>선호 실내 온도<input type="number" name="temperature" min="18" max="28" placeholder="예: 23" /></label>
            <label>룸메이트 희망 사항<input name="roommatePreference" placeholder="선택 입력" /></label>
          </div>
          <label className="wide-label">방 위치 배려가 필요한 신체적 사유<textarea name="accessibility" rows={3} placeholder="없으면 비워 두어도 됩니다." /></label>
        </section>

        <div className="form-footer">
          <p>{notice || "현재는 화면 구조를 확인하는 단계이며, 입력 내용은 아직 저장되지 않습니다."}</p>
          <button type="submit">입력 화면 확인</button>
        </div>
      </form>
    </main>
  );
}
