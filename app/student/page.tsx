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

export default function StudentApplicationPage() {
  const [connection, setConnection] = useState("연결 확인 중");
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("success");
  const [isSaving, setIsSaving] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [avoidances, setAvoidances] = useState<{student_id:string;student_name:string;reason:string}[]>([]);
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



      tidiness: data.get("tidiness") === "any" ? 3 : Number(data.get("tidiness")),
      noise_sensitivity: Number(data.get("noise")),
      preferred_temperature: data.get("temperature") === "any" ? 22 : Number(data.get("temperature")),
      light_sensitivity: (Number(data.get("lightSensitivity")) - 1) * 2 + 1,
      ventilation_preference: data.get("ventilationPreference") === "any" ? 3 : Number(data.get("ventilationPreference")),
      alarm_sensitivity: Number(data.get("noise")),
      environment_answers: {version:1, humidity:Number(data.get("humidity")), summer_ac:Number(data.get("summerAc")), winter_heater:Number(data.get("winterHeater"))},
      avoidance_requests: avoidances,
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
    setStudentId(""); setAvoidances([]); form.reset();
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
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><h2>생활 습관과 선호</h2></div>
        <div className="grid two-columns">
          <PreferenceField name="tidiness" title="함께 쓰는 공간의 정리 기준" flexible options={["조금 어질러져도 괜찮음", "며칠에 한 번 정리", "하루에 한 번 정리", "대체로 사용 직후 정리", "항상 사용 직후 정리"]} />
          <PreferenceField name="noise" title="잘 때 소리(대화·알람 등)에 대한 민감도" options={["소리가 있어도 잘 잠", "작은 소리는 괜찮음", "반복되는 소리는 신경 쓰임", "작은 소리에도 잠들기 어려움", "아주 작은 소리에도 쉽게 깸"]} />
          <PreferenceField name="lightSensitivity" title="잘 때 허용할 수 있는 밝기" options={["큰 불이 켜져 있어도 괜찮음", "큰 불을 끄고 작은 불만 켜면 괜찮음", "큰 불·작은 불을 모두 꺼야 편함"]} />
          <PreferenceField name="ventilationPreference" title="잘 때 창문을 여는 정도" flexible options={["닫고 자고 싶음", "잠깐 환기한 뒤 닫고 싶음", "가끔 조금 열고 싶음", "대부분 조금 열고 싶음", "계속 열어 두고 싶음"]} />
          <label><span>잘 때 편한 실내 온도 <b className="required-star">*</b></span><select name="temperature" defaultValue="" required><option value="" disabled>선택하세요</option><option value="20">서늘하게 · 20℃ 정도</option><option value="22">보통 · 22℃ 정도</option><option value="24">따뜻하게 · 24℃ 정도</option><option value="any">상관없음</option></select></label>
          <label><span>잘 때 편한 습도 <b className="required-star">*</b></span><select name="humidity" defaultValue="" required><option value="" disabled>선택하세요</option><option value="1">건조한 편</option><option value="2">보통</option><option value="3">촉촉한 편</option><option value="0">상관없음</option></select></label>
          {[["summerAc","여름에 잘 때 에어컨"],["winterHeater","겨울에 잘 때 히터"]].map(([name,title])=><label key={name}><span>{title} <b className="required-star">*</b></span><select name={name} defaultValue="" required><option value="" disabled>선택하세요</option><option value="1">끄고 자고 싶음</option><option value="2">예약으로 잠깐 켜고 싶음</option><option value="3">자는 동안 계속 켜고 싶음</option><option value="0">상관없음</option></select></label>)}
        </div>
      </section>
      <section className="form-section">
        <div className="section-heading"><h2>분리 배정 요청 (선택)</h2></div>
        <p className="avoidance-help">같은 방 사용이 어려운 학생과 구체적인 사유를 적어 주세요. 관리자만 확인하며, 검토 후 승인된 요청만 반영됩니다.</p>
        {avoidances.map((request,index)=><div className="avoidance-entry" key={index}>
          <div className="grid two-columns"><label><span>상대 학번</span><input required inputMode="numeric" pattern="[1-3][1-9](0[1-9]|[12][0-9]|30)" maxLength={4} value={request.student_id} onChange={event=>setAvoidances(rows=>rows.map((row,i)=>i===index?{...row,student_id:event.target.value.replace(/\D/g,"").slice(0,4)}:row))}/></label><label><span>상대 이름</span><input required maxLength={30} value={request.student_name} onChange={event=>setAvoidances(rows=>rows.map((row,i)=>i===index?{...row,student_name:event.target.value}:row))}/></label></div>
          <label><span>분리 배정이 필요한 사유</span><textarea required maxLength={500} rows={3} value={request.reason} onChange={event=>setAvoidances(rows=>rows.map((row,i)=>i===index?{...row,reason:event.target.value}:row))}/></label>
          <button type="button" className="secondary-button" onClick={()=>setAvoidances(rows=>rows.filter((_,i)=>i!==index))}>이 요청 삭제</button>
        </div>)}
        <button type="button" className="secondary-button" disabled={avoidances.length>=10} onClick={()=>setAvoidances(rows=>[...rows,{student_id:"",student_name:"",reason:""}])}>분리 요청 추가</button>
      </section>
      <div className="form-footer"><button type="submit" disabled={isSaving}>{isSaving ? "제출 중..." : "설문 제출하기"}</button></div>
    </form>
  </main>;
}
