"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [connection, setConnection] = useState("연결 확인 중");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function checkConnection() {
      const { error } = await supabase.auth.getSession();
      setConnection(error ? "연결 확인 필요" : "Supabase 연결됨");
    }
    void checkConnection();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const studentId = String(data.get("studentId") ?? "").trim();
    const { error } = await supabase.from("student_surveys").insert({
      student_id: studentId,
      student_name: String(data.get("name") ?? "").trim(),
      grade: Number(studentId.charAt(0)),
      wake_time: data.get("wakeTime"),
      sleep_time: data.get("sleepTime"),
      tidiness: Number(data.get("tidiness")),
      noise_sensitivity: Number(data.get("noise")),
      preferred_temperature: Number(data.get("temperature")),
      roommate_preference: String(data.get("roommatePreference") ?? "").trim() || null,
      accessibility_needs: String(data.get("accessibility") ?? "").trim() || null,
    });

    setIsSaving(false);
    if (error) {
      setNotice(`저장 실패: ${error.message}`);
      return;
    }

    setNotice("설문 응답이 Supabase에 안전하게 저장되었습니다.");
    form.reset();
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
          <div className="grid two-columns">
            <label><span>학번 <b className="required-star">*</b></span><input name="studentId" inputMode="numeric" pattern="[1-3][0-9]{3}" placeholder="예: 2602" required maxLength={4} title="학년으로 시작하는 네 자리 학번을 입력하세요." /><small>첫 번째 숫자로 학년을 자동 확인합니다.</small></label>
            <label><span>이름 <b className="required-star">*</b></span><input name="name" placeholder="이름 입력" required maxLength={30} /></label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading"><span>02</span><div><h2>생활 리듬</h2><p>평소 기숙사에서의 시간을 기준으로 입력하세요.</p></div></div>
          <div className="grid two-columns">
            <label><span>평균 기상 시간 <b className="required-star">*</b></span><input type="time" name="wakeTime" defaultValue="07:00" required /></label>
            <label><span>평균 취침 시간 <b className="required-star">*</b></span><input type="time" name="sleepTime" defaultValue="23:30" required /></label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading"><span>03</span><div><h2>생활 습관과 선호</h2><p>각 항목에서 자신과 가장 가까운 정도를 선택하세요.</p></div></div>
          <div className="grid two-columns">
            <label><span>정리정돈 습관 <b className="required-star">*</b></span><select name="tidiness" defaultValue="" required><option value="" disabled>선택</option><option value="5">매우 깔끔하게 유지</option><option value="3">보통</option><option value="1">크게 신경 쓰지 않음</option></select></label>
            <label><span>소음 민감도 <b className="required-star">*</b></span><select name="noise" defaultValue="" required><option value="" disabled>선택</option><option value="5">작은 소리에도 민감함</option><option value="3">보통</option><option value="1">소음에 둔감함</option></select></label>
            <label><span>선호 실내 온도 <b className="required-star">*</b></span><input type="number" name="temperature" min="18" max="28" placeholder="예: 23" required /></label>
            <label><span>룸메이트 희망 사항 <b className="optional-mark">(선택)</b></span><input name="roommatePreference" placeholder="함께 지내고 싶은 학생 또는 조건" maxLength={200} /></label>
          </div>
          <label className="wide-label"><span>방 위치 배려가 필요한 신체적 사유 <b className="optional-mark">(선택)</b></span><textarea name="accessibility" rows={3} placeholder="없으면 비워 두어도 됩니다." maxLength={500} /></label>
        </section>

        <div className="form-footer">
          <p>{notice || "필수 항목을 입력하고 제출하면 Supabase 데이터베이스에 저장됩니다."}</p>
          <button type="submit" disabled={isSaving}>{isSaving ? "저장 중..." : "설문 제출"}</button>
        </div>
      </form>
    </main>
  );
}
