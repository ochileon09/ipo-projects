import { allocateDormitory, createDefaultLayout, type AssignedRoom, type DormLayout, type ManualAssignment } from "./dormitory-layout";
import { applyGenderProfiles, conflictingStudentIds, isSchoolStudentId, selectRoster, type SurveyRow } from "./student-roster";
import { verifiedGender, type GenderProfile } from "./gender";
import { canShareRoom, roomCompatibilityScore } from "./roommate-matching";

export type SeparationRequest = { id:string; survey_id:string; requester_id:string; requester_name:string; target_student_id:string; target_student_name:string; reason:string; status:"pending"|"approved"|"rejected" };

export type SchoolSettings = { classCount: number; studentsPerClass: number; roomCapacity: number };
export type FinalAssignment = {
  id: string; confirmed_at: string; source_revision: number;
  layout: DormLayout; school: SchoolSettings; rooms: AssignedRoom<SurveyRow>[];
  gender_policy_version?: number;
};

/** Both the overview and editor derive the same proposal, including manual bed positions. */
export function buildDormitoryView({ surveys, school, layout, manualAssignments, testEnabled, includeDefaults, avoidanceRequests = [], finalAssignment = null, genderProfiles = [] }: {
  surveys: SurveyRow[]; school: SchoolSettings; layout: DormLayout | null;
  manualAssignments: ManualAssignment[]; testEnabled: boolean; includeDefaults: boolean; avoidanceRequests?: SeparationRequest[]; finalAssignment?: FinalAssignment | null;
  genderProfiles?: GenderProfile[];
}) {
  const effectiveSchool = finalAssignment?.school ?? school;
  const effectiveLayout = finalAssignment?.layout ?? layout ?? createDefaultLayout(school.classCount * school.studentsPerClass, school.roomCapacity);
  const roster = selectRoster(surveys, effectiveSchool.classCount, effectiveSchool.studentsPerClass, finalAssignment ? false : testEnabled, includeDefaults);
  const conflicts=conflictingStudentIds(roster.receivedStudents);
  roster.allStudents=applyGenderProfiles(roster.allStudents,genderProfiles,conflicts);
  roster.receivedStudents=applyGenderProfiles(roster.receivedStudents,genderProfiles,conflicts);
  roster.activeStudents=roster.allStudents.filter(student=>includeDefaults||!student.is_default);
  const active = roster.activeStudents.map(student => ({...student, avoid_with: [] as string[]}));
  for (const request of avoidanceRequests.filter(request=>request.status==="approved")) {
    const source=active.find(student=>student.id===request.survey_id);
    const target=active.find(student=>student.student_id===request.target_student_id && student.student_name===request.target_student_name);
    if(source && target) { source.avoid_with.push(target.student_id); target.avoid_with.push(source.student_id); }
  }
  roster.activeStudents = active;
  const physicalRooms=finalAssignment?new Map(allocateDormitory<SurveyRow>([],effectiveLayout).rooms.map(room=>[room.id,room])):null;
  const safeFinalRooms=finalAssignment?.rooms.map(room=>{
    const configured=physicalRooms!.get(room.id);
    const beds=room.beds.map(member=>{
      if(!member)return null;
      const current=roster.allStudents.find(student=>student.student_id===member.student_id&&(member.is_default||student.student_name===member.student_name));
      return current&&verifiedGender(current)!=="unknown"&&verifiedGender(current)===verifiedGender(member)&&configured?.gender===verifiedGender(current)&&configured.grade===current.grade ? member : null;
    });
    const students=beds.filter((student):student is SurveyRow=>student!==null);
    return {...room,gender:configured?.gender??"unknown",beds,students,score:students.length===room.students.length?room.score:roomCompatibilityScore(students)};
  });
  const genderReviewRequired=!!finalAssignment&&(finalAssignment.gender_policy_version!==1||safeFinalRooms!.reduce((n,room)=>n+room.students.length,0)!==finalAssignment.rooms.reduce((n,room)=>n+room.students.length,0));
  const allocation = finalAssignment ? {
    // Keep the saved answers, scores and bed positions; new or edited responses cannot change a final table.
    rooms: safeFinalRooms!,
    waiting: active.filter(student => !safeFinalRooms!.some(room => room.students.some(member => member.id === student.id || (member.is_default && member.student_id === student.student_id)))),
    validManual: [] as ManualAssignment[], inactiveManual: [] as ManualAssignment[], invalidManual: [] as ManualAssignment[],
  } : allocateDormitory(active, effectiveLayout, manualAssignments);
  const assignedCount = allocation.rooms.reduce((sum, room) => sum + room.students.length, 0);
  const totalBeds = allocation.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const actualCount = roster.allStudents.filter(student => !student.is_default && !student.is_test).length;
  const genderCapacity=[1,2,3].flatMap(grade=>(["male","female"] as const).map(gender=>{
    const demand=active.filter(student=>student.grade===grade&&verifiedGender(student)===gender).length;
    const rooms=allocation.rooms.filter(room=>room.grade===grade&&room.gender===gender);
    const capacity=rooms.reduce((n,room)=>n+room.capacity,0);
    const assigned=rooms.reduce((n,room)=>n+room.students.length,0);
    return {grade,gender,demand,capacity,assigned,waiting:demand-assigned,shortage:Math.max(0,demand-capacity)};
  }));
  const genderWaiting=allocation.waiting.filter(student=>verifiedGender(student)==="unknown");
  return {
    effectiveLayout, roster, allocation, assignedCount, totalBeds, schoolRosterSize: 3 * effectiveSchool.classCount * effectiveSchool.studentsPerClass,
    finalizedAt: finalAssignment?.confirmed_at ?? null,
    genderReviewRequired, genderCapacity, genderWaitingCount:genderWaiting.length,
    unconfiguredBeds:allocation.rooms.filter(room=>room.gender==="unknown").reduce((n,room)=>n+room.capacity,0),
    occupiedRooms: allocation.rooms.filter(room => room.students.length > 0).length,
    waitingCount: allocation.waiting.length + roster.receivedStudents.length - actualCount,
  };
}

export type SeparationCondition = SeparationRequest & { active: boolean; reviewed_at: string };
export function separationEligibility(request: SeparationRequest, surveys: SurveyRow[], school: SchoolSettings): string | null {
  const real=surveys.filter(student=>!student.is_test&&!student.is_default);
  const source=real.find(student=>student.id===request.survey_id);
  if(!source)return "신청자의 실제 응답을 확인할 수 없습니다.";
  if(!isSchoolStudentId(source.student_id,school.classCount,school.studentsPerClass)||!isSchoolStudentId(request.target_student_id,school.classCount,school.studentsPerClass))return "학교 명단의 반·번호 범위를 확인하세요.";
  if(real.filter(student=>student.student_id===source.student_id).length!==1)return "신청자 학번에 다른 이름의 응답이 있습니다.";
  const targets=real.filter(student=>student.student_id===request.target_student_id);
  if(!targets.length)return "상대 학번의 실제 설문이 없습니다. 학번 또는 미응답 여부를 확인하세요.";
  if(targets.length!==1)return "상대 학번에 다른 이름의 응답이 있습니다.";
  if(targets[0].student_name.trim()!==request.target_student_name.trim())return "상대 학번과 이름이 일치하지 않습니다.";
  if(source.student_id===targets[0].student_id)return "본인에 대한 분리 요청입니다.";
  if(source.grade!==targets[0].grade)return "서로 다른 학년은 이미 분리 배정됩니다.";
  if(verifiedGender(source)==="unknown"||verifiedGender(targets[0])==="unknown")return "성별 확인이 완료된 뒤 승인할 수 있습니다.";
  if(verifiedGender(source)!==verifiedGender(targets[0]))return "서로 다른 성별은 이미 분리 배정됩니다.";
  return null;
}

export const waitingLabels = {
  roster: "학교 명단 범위 밖", identity: "동일 학번·이름 확인 필요", gender: "성별 확인 대기",
  finalReview: "확정 기록의 성별 재검토 필요", final: "확정 이후 접수 · 배정 대기",
  room: "호실 성별 설정 필요", capacity: "해당 학년·성별 자리 부족", conditions: "배치·분리 조건 검토 필요",
};
export type WaitingCategory = keyof typeof waitingLabels;
export function waitingCategory(student: SurveyRow, view: ReturnType<typeof buildDormitoryView>): WaitingCategory {
  if(!view.roster.allStudents.some(member=>member.student_id===student.student_id))return "roster";
  if(conflictingStudentIds(view.roster.receivedStudents).has(student.student_id))return "identity";
  if(verifiedGender(student)==="unknown")return "gender";
  if(view.finalizedAt)return view.genderReviewRequired?"finalReview":"final";
  const group=view.genderCapacity.find(item=>item.grade===student.grade&&item.gender===verifiedGender(student));
  if(!group?.capacity&&view.allocation.rooms.some(room=>room.grade===student.grade&&room.gender==="unknown"))return "room";
  const vacancies=view.allocation.rooms.filter(room=>room.grade===student.grade&&room.gender===verifiedGender(student)&&room.beds.includes(null));
  if(vacancies.length&&vacancies.every(room=>room.students.some(member=>!canShareRoom(member,student))))return "conditions";
  return group&&group.shortage>0?"capacity":"conditions";
}
export function waitingReason(student: SurveyRow, view: ReturnType<typeof buildDormitoryView>) {
  return waitingLabels[waitingCategory(student,view)];
}

/** Count current candidates, plus held final occupants, with excluded receipt records shown separately. */
export function summarizeDormitory(view: ReturnType<typeof buildDormitoryView>) {
  const selectedIds=new Set(view.roster.allStudents.filter(student=>!student.is_default&&!student.is_test).map(student=>student.id));
  const reviewRecords=view.roster.receivedStudents.filter(student=>!selectedIds.has(student.id));
  const waiters=[...view.allocation.waiting,...reviewRecords].map(student=>({student,category:waitingCategory(student,view)}));
  const targets=new Map(view.roster.activeStudents.map(student=>[student.student_id,student]));
  view.allocation.rooms.flatMap(room=>room.students).forEach(student=>{if(!targets.has(student.student_id))targets.set(student.student_id,student);});
  const rows=[1,2,3].flatMap(grade=>(["male","female","unknown"] as const).map(gender=>{
    const group=view.genderCapacity.find(item=>item.grade===grade&&item.gender===gender);
    return {grade,gender,students:[...targets.values()].filter(student=>student.grade===grade&&verifiedGender(student)===gender).length,
      capacity:gender==="unknown"?null:group?.capacity??0,
      assigned:view.allocation.rooms.filter(room=>room.grade===grade&&room.gender===gender).reduce((sum,room)=>sum+room.students.length,0),
      waiting:view.allocation.waiting.filter(student=>student.grade===grade&&verifiedGender(student)===gender).length};
  }));
  const reasons=(Object.keys(waitingLabels) as WaitingCategory[]).map(category=>({category,label:waitingLabels[category],count:waiters.filter(item=>item.category===category).length}));
  return {rows,waiters,reasons,totalWaiting:waiters.length,reviewCount:reviewRecords.length,
    totalStudents:targets.size,totalCapacity:rows.reduce((sum,row)=>sum+(row.capacity??0),0),
    totalAssigned:rows.reduce((sum,row)=>sum+row.assigned,0),targetWaiting:view.allocation.waiting.length};
}
export function separationApplication(condition: SeparationCondition, surveys: SurveyRow[], school: SchoolSettings, rooms: ReturnType<typeof allocateDormitory<SurveyRow>>["rooms"]) {
  if(!condition.active)return {state:"inactive",label:"해제됨"};
  const issue=separationEligibility(condition,surveys,school);
  if(issue)return {state:"warning",label:"대상 확인 필요",detail:issue};
  const source=rooms.find(room=>room.students.some(student=>student.id===condition.survey_id));
  const target=rooms.find(room=>room.students.some(student=>student.student_id===condition.target_student_id&&student.student_name===condition.target_student_name));
  if(!source||!target)return {state:"waiting",label:"배정 대기 · 분리 조건 유지"};
  if(source.id===target.id)return {state:"warning",label:"배정 충돌 · 확인 필요"};
  return {state:"applied",label:"분리 적용 중"};
}
