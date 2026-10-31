import { allocateDormitory, createDefaultLayout, type DormLayout, type ManualAssignment } from "./dormitory-layout";
import { selectRoster, type SurveyRow } from "./student-roster";

export type SchoolSettings = { classCount: number; studentsPerClass: number; roomCapacity: number };

/** Both the overview and editor derive the same proposal, including manual bed positions. */
export function buildDormitoryView({ surveys, school, layout, manualAssignments, testEnabled, includeDefaults }: {
  surveys: SurveyRow[]; school: SchoolSettings; layout: DormLayout | null;
  manualAssignments: ManualAssignment[]; testEnabled: boolean; includeDefaults: boolean;
}) {
  const effectiveLayout = layout ?? createDefaultLayout(school.classCount * school.studentsPerClass, school.roomCapacity);
  const roster = selectRoster(surveys, school.classCount, school.studentsPerClass, testEnabled, includeDefaults);
  const allocation = allocateDormitory(roster.activeStudents, effectiveLayout, manualAssignments);
  const assignedCount = allocation.rooms.reduce((sum, room) => sum + room.students.length, 0);
  const totalBeds = allocation.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const actualCount = roster.allStudents.filter(student => !student.is_default && !student.is_test).length;
  return {
    effectiveLayout, roster, allocation, assignedCount, totalBeds,
    occupiedRooms: allocation.rooms.filter(room => room.students.length > 0).length,
    waitingCount: allocation.waiting.length + roster.receivedStudents.length - actualCount,
  };
}
