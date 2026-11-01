import { allocateDormitory, createDefaultLayout, type DormLayout, type ManualAssignment } from "./dormitory-layout";
import { isSchoolStudentId, selectRoster, type SurveyRow } from "./student-roster";

export type SeparationRequest = { id:string; survey_id:string; requester_id:string; requester_name:string; target_student_id:string; target_student_name:string; reason:string; status:"pending"|"approved"|"rejected" };

export type SchoolSettings = { classCount: number; studentsPerClass: number; roomCapacity: number };

/** Both the overview and editor derive the same proposal, including manual bed positions. */
export function buildDormitoryView({ surveys, school, layout, manualAssignments, testEnabled, includeDefaults, avoidanceRequests = [] }: {
  surveys: SurveyRow[]; school: SchoolSettings; layout: DormLayout | null;
  manualAssignments: ManualAssignment[]; testEnabled: boolean; includeDefaults: boolean; avoidanceRequests?: SeparationRequest[];
}) {
  const effectiveLayout = layout ?? createDefaultLayout(school.classCount * school.studentsPerClass, school.roomCapacity);
  const roster = selectRoster(surveys, school.classCount, school.studentsPerClass, testEnabled, includeDefaults);
  const active = roster.activeStudents.map(student => ({...student, avoid_with: [] as string[]}));
  for (const request of avoidanceRequests.filter(request=>request.status==="approved")) {
    const source=active.find(student=>student.id===request.survey_id);
    const target=active.find(student=>student.student_id===request.target_student_id && student.student_name===request.target_student_name);
    if(source && target) { source.avoid_with.push(target.student_id); target.avoid_with.push(source.student_id); }
  }
  roster.activeStudents = active;
  const allocation = allocateDormitory(active, effectiveLayout, manualAssignments);
  const assignedCount = allocation.rooms.reduce((sum, room) => sum + room.students.length, 0);
  const totalBeds = allocation.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const actualCount = roster.allStudents.filter(student => !student.is_default && !student.is_test).length;
  return {
    effectiveLayout, roster, allocation, assignedCount, totalBeds, schoolRosterSize: 3 * school.classCount * school.studentsPerClass,
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
  return null;
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
