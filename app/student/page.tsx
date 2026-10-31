"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";

function PreferenceField({ name, title, options, flexible = false }: { name: string; title: string; options: string[]; flexible?: boolean }) {
  return <label><span>{title} <b className="required-star">*</b></span><select name={name} defaultValue="" required>
    <option value="" disabled>선택하세요</option>
    {options.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
    {flexible && <option value="any">상관없음</option>}
  </select></label>;
}

function NightActivityField({ name, title }: { name: string; title: string }) {
  return <label><span>{title} <b className="required-star">*</b></span><select name={name} defaultValue="" required>
    <option value="" disabled>빈도를 선택하세요</option><option value="1">전혀 하지 않음</option>
    <option value="2">일주일에 1일 정도</option><option value="3">일주일에 2~3일</option>
    <option value="4">일주일에 4일 정도</option><option value="5">거의 매일</option>
  </select></label>;
}

export default function StudentApplicationPage() {
  const [connection, setConnection] = useState("연결 확인 중");
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("success");
  const [isSaving, setIsSaving] = useState(false);
  const [studentId, setStudentId] = useState("");
  const grade = /^[1-3]/.test(studentId) ? `${studentId.charAt(0)}학년` : "1~3학년의 네 자리 학번";

  useEffect(() => {
    async function checkConnection() {
      const { data, error } = await supabase.rpc("check_student_surveys_ready");
      setConnection(!error && data === true ? "설문 접수 가능" : "연결 확인 필요");
    }
    void checkConnection();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true); setNotice(""); setNoticeKind("error");
    const form = event.currentTarget;
    const data = new FormData(form);
    const submittedStudentId = String(data.get("studentId") ?? "").trim();
    const submittedName = String(data.get("name") ?? "").trim();
    if (!submittedName) {
      setIsSaving(false);
      setNotice("이름은 공백만 입력할 수 없습니다.");
      return;
    }
    const { data: receipt, error } = await supabase.rpc("submit_student_survey", { p_survey: {
      student_id: submittedStudentId,
      student_name: submittedName,
      grade: Number(submittedStudentId.charAt(0)),
      wake_time: data.get("wakeTime"),
      sleep_time: data.get("sleepTime"),
      shower_time: data.get("showerTime"),
      shower_duration_minutes: Number(data.get("showerDuration")),
      night_noise_activity: Number(data.get("nightNoiseActivity")),
      night_light_usage: Number(data.get("nightLightUsage")),
      alarm_repeats: Number(data.get("alarmRepeats")),
      tidiness: data.get("tidiness") === "any" ? 3 : Number(data.get("tidiness")),
      noise_sensitivity: Number(data.get("noise")),
      preferred_temperature: data.get("temperature") === "any" ? 22 : Number(data.get("temperature")),
      light_sensitivity: Number(data.get("lightSensitivity")),
      ventilation_preference: data.get("ventilationPreference") === "any" ? 3 : Number(data.get("ventilationPreference")),
      alarm_sensitivity: Number(data.get("noise")),
      flexible_preferences: [
        ...(data.get("tidiness") === "any" ? ["tidiness"] : []),
        ...(data.get("ventilationPreference") === "any" ? ["ventilation"] : []),
        ...(data.get("temperature") === "any" ? ["temperature"] : []),
      ],
    } });
    setIsSaving(false);
    if (error) { setNotice(`저장 실패: ${error.message}`); return; }
    const saved = receipt?.[0];
    if (!saved?.survey_id) { setNotice("저장 결과를 확인하지 못했습니다. 잠시 후 다시 제출해 주세요."); return; }
    setNoticeKind(saved.matches_school_roster ? "success" : "warning");
    setNotice((saved.was_updated ? "기존 설문을 새 응답으로 갱신했습니다." : "설문이 DB에 저장되었습니다.") + (saved.matches_school_roster ? " 관리자 화면의 실제 설문 접수 명단에 반영됩니다." : " 현재 학교 명단의 반·번호 범위를 벗어나 자동 배정은 대기 중입니다. 관리자에게 명단 설정 확인을 요청해 주세요."));
    setStudentId(""); form.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main>
    <header className="survey-heading">
      <div className="page-title"><h1>학생 설문</h1><Link className="help-link" href="/help#student">작성 도움말</Link></div>
      <div className="survey-meta"><span>최근 2주 평일 기준 · * 필수</span><span role="status">{connection}</span></div>
    </header>

    {notice && <p className={`notice ${noticeKind}`} role="status">{notice}</p>}

    <form className="survey" onSubmit={handleSubmit}>
      <section className="form-section">
        <div className="section-heading"><h2>기본 정보</h2></div>
        <div className="grid two-columns">
          <label><span>학번 <b className="required-star">*</b></span><input name="studentId" inputMode="numeric" pattern="[1-3][1-9](0[1-9]|[12][0-9]|30)" placeholder="예: 2602" required maxLength={4} title="학년·반·번호 순서의 네 자리 학번을 입력하세요." value={studentId} onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 4))} /><small>{grade}</small></label>
          <label><span>이름 <b className="required-star">*</b></span><input name="name" placeholder="이름 입력" required maxLength={30} /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><h2>생활 리듬</h2></div>
        <div className="grid two-columns">
          <label><span>보통 일어나는 시간 <b className="required-star">*</b></span><input type="time" name="wakeTime" required /></label>
          <label><span>불을 끄고 잠을 청하는 시간 <b className="required-star">*</b></span><input type="time" name="sleepTime" required /></label>
          <label><span>주로 샤워를 시작하는 시간 <b className="required-star">*</b></span><input type="time" name="showerTime" required /><small>여러 번 씻으면 가장 자주 이용하는 시간 하나를 입력하세요.</small></label>
          <label><span>샤워 1회 소요 시간 <b className="required-star">*</b></span><select name="showerDuration" defaultValue="" required><option value="" disabled>평균 소요 시간을 선택하세요</option>{[5,10,15,20,30,45,60].map(minutes=><option key={minutes} value={minutes}>{minutes}분{minutes===60?" 정도":""}</option>)}</select></label>
          <label><span>기상 알람 횟수 (스누즈 포함) <b className="required-star">*</b></span><select name="alarmRepeats" defaultValue="" required><option value="" disabled>횟수를 선택하세요</option><option value="0">알람을 사용하지 않음</option>{[1,2,3,4,5].map(count=><option key={count} value={count}>{count}회{count===5?" 이상":""}</option>)}</select></label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><h2>생활 습관과 선호</h2></div>
        <div className="grid two-columns">
          <PreferenceField name="tidiness" title="함께 쓰는 공간의 정리 기준" flexible options={["조금 어질러져도 괜찮음", "며칠에 한 번 정리", "하루에 한 번 정리", "대체로 사용 직후 정리", "항상 사용 직후 정리"]} />
          <PreferenceField name="noise" title="잘 때 소리(대화·알람 등)에 대한 민감도" options={["소리가 있어도 잘 잠", "작은 소리는 괜찮음", "반복되는 소리는 신경 쓰임", "작은 소리에도 잠들기 어려움", "아주 작은 소리에도 쉽게 깸"]} />
          <PreferenceField name="lightSensitivity" title="잘 때 허용할 수 있는 밝기" options={["방 조명이 켜져 있어도 괜찮음", "밝은 스탠드 정도는 괜찮음", "작은 스탠드 정도는 괜찮음", "아주 약한 빛만 괜찮음", "완전히 어두워야 편함"]} />
          <PreferenceField name="ventilationPreference" title="잘 때 창문을 여는 정도" flexible options={["닫고 자고 싶음", "잠깐 환기한 뒤 닫고 싶음", "가끔 조금 열고 싶음", "대부분 조금 열고 싶음", "계속 열어 두고 싶음"]} />
          <label><span>잘 때 편한 실내 온도 <b className="required-star">*</b></span><select name="temperature" defaultValue="" required><option value="" disabled>선택하세요</option><option value="20">서늘하게 · 20℃ 정도</option><option value="22">보통 · 22℃ 정도</option><option value="24">따뜻하게 · 24℃ 정도</option><option value="any">상관없음</option></select></label>
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><h2>룸메이트가 잠든 뒤의 습관</h2></div>
        <div className="grid two-columns">
          <NightActivityField name="nightNoiseActivity" title="통화·대화 등 소리가 나는 활동 빈도" />
          <NightActivityField name="nightLightUsage" title="스탠드나 조명을 켜 두는 빈도" />
        </div>
      </section>
      <div className="form-footer"><button type="submit" disabled={isSaving}>{isSaving ? "제출 중..." : "설문 제출하기"}</button></div>
    </form>
  </main>;
}
