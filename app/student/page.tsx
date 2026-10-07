"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

function ScoreField({ name, title, low, high }: { name: string; title: string; low: string; high: string }) {
  return <fieldset className="score-field">
    <legend>{title} <b className="required-star">*</b></legend>
    <div className="score-options">{[1, 2, 3, 4, 5].map((score) => <label key={score}>
      <input type="radio" name={name} value={score} required /><span>{score}</span>
    </label>)}</div>
    <div className="scale-labels"><span>{low}</span><span>보통</span><span>{high}</span></div>
  </fieldset>;
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
    if (isSaving) return;
    setIsSaving(true); setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const submittedStudentId = String(data.get("studentId") ?? "").trim();
    const submittedName = String(data.get("name") ?? "").trim();
    if (!submittedName) {
      setIsSaving(false);
      setNotice("이름은 공백만 입력할 수 없습니다.");
      return;
    }
    const { error } = await supabase.from("student_surveys").insert({
      student_id: submittedStudentId,
      student_name: submittedName,
      grade: Number(submittedStudentId.charAt(0)),
      wake_time: data.get("wakeTime"),
      sleep_time: data.get("sleepTime"),
      shower_time: data.get("showerTime"),
      shower_frequency: Number(data.get("showerFrequency")),
      tidiness: Number(data.get("tidiness")),
      noise_sensitivity: Number(data.get("noise")),
      preferred_temperature: Number(data.get("temperature")),
      light_sensitivity: Number(data.get("lightSensitivity")),
      ventilation_preference: Number(data.get("ventilationPreference")),
      alarm_sensitivity: Number(data.get("alarmSensitivity")),
      room_activity: Number(data.get("roomActivity")),
      roommate_preference: String(data.get("roommatePreference") ?? "").trim() || null,
      accessibility_needs: String(data.get("accessibility") ?? "").trim() || null,
    });
    setIsSaving(false);
    if (error) { setNotice(`저장 실패: ${error.message}`); return; }
    setNotice("설문 응답이 Supabase에 안전하게 저장되었습니다.");
    setStudentId(""); setTemperature(22); form.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main>
    <header className="hero">
      <div className="hero-copy"><p className="eyebrow">학생 신청용</p><h1>기숙사 생활 습관<br />설문 신청</h1>
        <p className="lead">호실 배정에 필요한 기본 정보와 생활 습관을 입력합니다. 입력한 내용은 이후 룸메이트 배정에 활용됩니다.</p></div>
      <div className="hero-card" aria-label="개발 현황"><span className="status-dot" /><div><strong>{connection}</strong><p>3차시 · 설문 입력 및 확인</p></div></div>
    </header>

    {notice && <p className={`notice ${notice.startsWith("저장 실패") || notice.startsWith("이름") ? "error" : "success"}`} role="status">{notice}</p>}

    <form className="survey" onSubmit={handleSubmit}>
      <section className="form-section">
        <div className="section-heading"><span>01</span><div><h2>학생 기본 정보</h2><p>배정 결과를 구분하기 위한 기본 정보입니다.</p></div></div>
        <div className="grid two-columns">
          <label><span>학번 <b className="required-star">*</b></span><input name="studentId" inputMode="numeric" pattern="[1-3][1-9](0[1-9]|[12][0-9]|30)" placeholder="예: 2602" required maxLength={4} title="학년·반·번호 순서의 네 자리 학번을 입력하세요." value={studentId} onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 4))} /><small>1~3학년의 네 자리 학번을 입력합니다.</small></label>
          <label><span>이름 <b className="required-star">*</b></span><input name="name" placeholder="이름 입력" required maxLength={30} /></label>
          <label><span>학년</span><input value={grade} readOnly aria-label="자동 확인된 학년" /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><span>02</span><div><h2>생활 리듬</h2><p>평소 기숙사에서의 시간을 기준으로 입력하세요.</p></div></div>
        <div className="grid two-columns">
          <label><span>평균 기상 시간 <b className="required-star">*</b></span><input type="time" name="wakeTime" defaultValue="07:30" required /></label>
          <label><span>평균 취침 시간 <b className="required-star">*</b></span><input type="time" name="sleepTime" defaultValue="00:30" required /></label>
          <label><span>주로 씻는 시간 <b className="required-star">*</b></span><input type="time" name="showerTime" defaultValue="07:40" required /><small>하루 중 가장 자주 씻는 시간을 입력하세요.</small></label>
          <label><span>하루 샤워 횟수 <b className="required-star">*</b></span><select name="showerFrequency" defaultValue="1" required><option value="1">1회</option><option value="2">2회</option><option value="3">3회 이상</option></select></label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><span>03</span><div><h2>생활 습관과 선호</h2><p>각 항목에서 자신과 가장 가까운 정도를 선택하세요.</p></div></div>
        <div className="grid two-columns">
          <ScoreField name="tidiness" title="청결·정리 민감도" low="크게 신경 쓰지 않음" high="매우 민감함" />
          <ScoreField name="noise" title="소음 민감도" low="둔감" high="민감" />
          <ScoreField name="lightSensitivity" title="조명 민감도" low="불을 켜도 괜찮음" high="어두워야 편함" />
          <ScoreField name="ventilationPreference" title="환기 선호도" low="창문을 잘 열지 않음" high="자주 환기함" />
          <ScoreField name="alarmSensitivity" title="알람 민감도" low="알람 소리에 둔감" high="쉽게 깸" />
          <ScoreField name="roomActivity" title="방 안 활동 정도" low="주로 잠만 잠" high="공부·통화를 자주 함" />
          <label className="range-field"><span>선호 실내 온도 <b className="required-star">*</b></span><strong>{temperature}℃</strong><input type="range" name="temperature" min="18" max="26" step="1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} required /><small><span>18℃</span><span>22℃</span><span>26℃</span></small></label>
          <label><span>룸메이트 희망 사항 <b className="optional-mark">(선택)</b></span><input name="roommatePreference" placeholder="함께 지내고 싶은 학생 또는 조건" maxLength={200} /></label>
        </div>
        <label className="wide-label"><span>방 위치 배려가 필요한 신체적 사유 <b className="optional-mark">(선택)</b></span><textarea name="accessibility" rows={3} placeholder="없으면 비워 두어도 됩니다." maxLength={500} /></label>
      </section>
      <div className="form-footer"><p>설문 제출 버튼을 누르면 입력한 내용이 Supabase 데이터베이스에 저장됩니다.</p><button type="submit" disabled={isSaving}>{isSaving ? "저장 중..." : "설문 제출"}</button></div>
    </form>
  </main>;
}
