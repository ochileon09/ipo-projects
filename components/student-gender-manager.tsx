"use client";
import { useState } from "react";
import { genderLabels, verifiedGender, type Gender, type GenderProfile } from "@/lib/gender";
import type { SurveyRow } from "@/lib/student-roster";

function GenderRow({student,profile,locked,busy,onSave}:{student:SurveyRow;profile?:GenderProfile;locked:boolean;busy:boolean;onSave:(id:string,name:string,gender:Gender)=>void}) {
  const [name,setName]=useState(profile?.student_name??(student.is_default?"":student.student_name));
  const [gender,setGender]=useState<Gender>(profile?.gender??"unknown");
  return <tr><td>{student.student_id}</td><td>{student.is_default?<input aria-label={`${student.student_id} 확인할 이름`} value={name} maxLength={30} placeholder="학교 명단의 이름" onChange={event=>setName(event.target.value)}/>:student.student_name}</td><td>{genderLabels[student.reported_gender??"unknown"]}</td><td><span className={verifiedGender(student)==="unknown"?"default-badge":"live-badge"}>{verifiedGender(student)==="unknown"?"확인 대기":genderLabels[verifiedGender(student)]+" · 확인됨"}</span></td><td><select aria-label={`${student.student_id} 확인 성별`} value={gender} disabled={locked||busy} onChange={event=>setGender(event.target.value as Gender)}><option value="unknown">미확인</option><option value="male">남학생</option><option value="female">여학생</option></select></td><td><button type="button" disabled={locked||busy||!name.trim()} onClick={()=>onSave(student.student_id,student.is_default?name:student.student_name,gender)}>{gender==="unknown"?"미확인 처리":"확인·저장"}</button></td></tr>;
}

export function StudentGenderManager({students,profiles,locked,busy,onSave}:{students:SurveyRow[];profiles:GenderProfile[];locked:boolean;busy:boolean;onSave:(id:string,name:string,gender:Gender)=>void}) {
  const [query,setQuery]=useState(""); const [onlyUnknown,setOnlyUnknown]=useState(true);
  const rows=students.filter(student=>!student.is_test&&(!onlyUnknown||verifiedGender(student)==="unknown")&&(student.student_id.includes(query)||student.student_name.includes(query)));
  return <details className="gender-manager"><summary>학생 성별 확인·관리</summary><div className="gender-manager-body"><p>학교 명단으로 확인한 성별만 저장하세요. 이름·학번으로 추측하지 않습니다. 설문이 없는 학생은 명단의 이름도 입력하세요. 미확인 학생은 배정 대기합니다.</p><div className="gender-manager-tools"><label>학번·이름 검색<input value={query} onChange={event=>setQuery(event.target.value)} /></label><label className="check-label"><input type="checkbox" checked={onlyUnknown} onChange={event=>setOnlyUnknown(event.target.checked)} />미확인만 보기</label></div><div className="table-wrap"><table className="survey-table"><thead><tr><th>학번</th><th>이름</th><th>설문 입력</th><th>현재 상태</th><th>관리자 확인</th><th>저장</th></tr></thead><tbody>{rows.map(student=><GenderRow key={student.id+"/"+(profiles.find(profile=>profile.student_id===student.student_id)?.verified_at??"")} student={student} profile={profiles.find(profile=>profile.student_id===student.student_id)} locked={locked} busy={busy} onSave={onSave}/>)}{!rows.length&&<tr><td colSpan={6}>해당 학생이 없습니다.</td></tr>}</tbody></table></div></div></details>;
}
