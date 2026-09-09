"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

function ScoreField({ name, title, low, high }: { name: string; title: string; low: string; high: string }) {
  return (
    <fieldset className="score-field">
      <legend>{title} <b className="required-star">*</b></legend>
      <div className="score-options">
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score}>
            <input type="radio" name={name} value={score} required />
            <span>{score}</span>
          </label>
        ))}
      </div>
      <div className="scale-labels"><span>{low}</span><span>보통</span><span>{high}</span></div>
    </fieldset>
  );
}

export default function StudentApplicationPage() {
  const [connection, setConnection] = useState("연결 확인 중");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [temperature, setTemperature] = useState(22);
  const grade = /^[1-3]/.test(studentId) ? `${studentId.charAt(0)}학년` : "학번 입력 시 자동 표시";

  useEffect(() => {
    async function checkConnection() {
      const { data, error } = await supabase.rpc("check_student_surveys_ready");
      setConnection(!error && data === true ? "Supabase DB 준비됨" : "DB 연결 확인 필요");
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
          <p className="eyebrow">학생 신청용</p>
          <h1>기숙사 생활 습관<br />설문 신청</h1>
          <p className="lead">호실 배정에 필요한 기본 정보와 생활 습관을 입력합니다. 입력한 내용은 이후 룸메이트 배정에 활용됩니다.</p>
        </div>
        <div className="hero-card" aria-label="개발 현황">
          <span className="status-dot" />
          <div><strong>{connection}</strong><p>2~3차시 · 신청 화면 뼈대</p></div>
        </div>
      </header>

      <form className="survey" onSubmit={handleSubmit}>
        <section className="form-section">
          <div className="section-heading"><span>01</span><div><h2>학생 기본 정보</h2><p>배정 결과를 구분하기 위한 기본 정보입니다.</p></div></div>
          <div className="grid two-columns">
            <label><span>학번 <b className="required-star">*</b></span><input name="studentId" inputMode="numeric" pattern="[1-3][0-9]{3}" placeholder="예: 2602" required maxLength={4} title="학년으로 시작하는 네 자리 학번을 입력하세요." value={studentId} onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 4))} /><small>첫 번째 숫자로 학년을 자동 확인합니다.</small></label>
            <label><span>이름 <b className="required-star">*</b></span><input name="name" placeholder="이름 입력" required maxLength={30} /></label>
            <label><span>학년</span><input value={grade} readOnly aria-label="자동 확인된 학년" /></label>
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
            <ScoreField name="tidiness" title="정리정돈 습관" low="크게 신경 쓰지 않음" high="매우 깔끔함" />
            <ScoreField name="noise" title="소음 민감도" low="둔감" high="민감" />
            <label className="range-field"><span>선호 실내 온도 <b className="required-star">*</b></span><strong>{temperature}℃</strong><input type="range" name="temperature" min="18" max="26" step="1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} required /><small><span>18℃</span><span>22℃</span><span>26℃</span></small></label>
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
