import { allocateDormitory, createDefaultLayout, type DormLayout, type ManualAssignment } from "./dormitory-layout";
import { selectRoster, type SurveyRow } from "./student-roster";

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
