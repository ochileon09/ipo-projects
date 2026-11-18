"use client";

import { useState } from "react";
import { summarizeDormitory, waitingLabels, type WaitingCategory, type buildDormitoryView } from "@/lib/dormitory-view";
import { genderLabels } from "@/lib/gender";

export function AssignmentStatus({view,loading=false}:{view:ReturnType<typeof buildDormitoryView>;loading?:boolean}) {
  const [filter,setFilter]=useState<WaitingCategory|"all">("all");
  const [open,setOpen]=useState(false);
  const summary=summarizeDormitory(view);
  const activeFilter=filter!=="all"&&!summary.reasons.some(reason=>reason.category===filter&&reason.count)?"all":filter;
  const waiters=summary.waiters.filter(item=>activeFilter==="all"||item.category===activeFilter);
  return <section className="assignment-status" aria-labelledby="assignment-status-title" aria-busy={loading}>
    <header><div><h2 id="assignment-status-title">학년·성별 배정 현황</h2><p>현재 배정 대상 기준 · 활성화한 테스트·미응답 학생 포함 · 자리는 배정된 자리 포함</p></div><span>배정 대기 <strong>{summary.totalWaiting}명</strong></span></header>
    <div className="table-wrap"><table className="assignment-status-table"><thead><tr><th scope="col">학년</th><th scope="col">성별</th><th scope="col">학생 수</th><th scope="col">배정 가능 자리</th><th scope="col">배정</th><th scope="col">대기</th></tr></thead><tbody>{summary.rows.map((row,index)=><tr key={row.grade+row.gender} className={(index%3===0?"grade-start ":"")+(row.gender==="unknown"?"unknown-row":"")}>
      {index%3===0&&<th scope="rowgroup" rowSpan={3}>{row.grade}학년</th>}<th scope="row">{genderLabels[row.gender]}</th><td>{row.students}명</td><td>{row.capacity===null?<span title="성별 확인 전에는 배정 가능한 자리를 정할 수 없습니다.">—</span>:`${row.capacity}자리`}</td><td>{row.assigned}명</td><td className={row.waiting?"has-waiters":""}>{row.waiting}명</td>
    </tr>)}</tbody><tfoot><tr><th colSpan={2} scope="row">합계</th><td>{summary.totalStudents}명</td><td>{summary.totalCapacity}자리</td><td>{summary.totalAssigned}명</td><td>{summary.targetWaiting}명</td></tr></tfoot></table></div>
    <div className="assignment-status-notes"><span>성별 미설정 공간 {view.unconfiguredBeds}자리 제외</span>{summary.reviewCount>0&&<span>명단 검토 {summary.reviewCount}건은 표와 별도 집계</span>}</div>
    <div className="waiting-reasons" aria-label="대기 사유별 인원"><h3>대기 사유</h3><div><button type="button" className="reason-filter" aria-pressed={activeFilter==="all"} onClick={()=>{setFilter("all");setOpen(true);}}>전체 {summary.totalWaiting}명</button>{summary.reasons.filter(reason=>reason.count>0).map(reason=><button key={reason.category} type="button" className="reason-filter" aria-pressed={activeFilter===reason.category} onClick={()=>{setFilter(reason.category);setOpen(true);}}>{reason.label} {reason.count}명</button>)}</div></div>
    <details className="waiting-details" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>대기 명단 {waiters.length}명</summary><div className="table-wrap"><table className="survey-table"><thead><tr><th>학번</th><th>이름</th><th>대기 사유</th></tr></thead><tbody>{waiters.map(({student,category})=><tr key={student.id}><td>{student.student_id}</td><td>{student.student_name}{student.is_test&&<small> · 테스트</small>}{student.is_default&&<small> · 기본값</small>}</td><td>{waitingLabels[category]}</td></tr>)}{!waiters.length&&<tr><td colSpan={3}>대기 중인 학생이 없습니다.</td></tr>}</tbody></table></div></details>
  </section>;
}
