import { buildDormitoryView } from "./dormitory-view";
import { explainRoommates } from "./roommate-matching";

/** Return one student's result, never roommate identities, raw answers or separation reasons. */
export function studentAssignmentResult(view: ReturnType<typeof buildDormitoryView>, studentId: string, studentName: string) {
  const responses = view.roster.receivedStudents.filter(student => student.student_id === studentId && student.student_name === studentName);
  if (responses.length !== 1) return null;
  const room = view.allocation.rooms.find(room => room.students.some(student => student.student_id === studentId && (student.student_name === studentName || student.is_default)));
  const phase = view.finalizedAt ? "final" as const : "proposal" as const;
  if (view.roster.receivedStudents.filter(student => student.student_id === studentId).length > 1) {
    return { phase, confirmedAt: view.finalizedAt, assigned: false as const, message: "같은 학번에 서로 다른 이름의 응답이 있습니다. 관리자에게 학번·이름 확인을 요청해 주세요." };
  }
  if (!room) return { phase, confirmedAt: view.finalizedAt, assigned: false as const,
    message: view.finalizedAt ? "확정 배정표에 포함되지 않았습니다. 새 응답은 접수됐으며 관리자가 확정을 해제한 뒤 배정할 수 있습니다." : "아직 배정되지 않았습니다. 학교 명단 범위·동일 학번 응답·남은 정원을 관리자에게 확인해 주세요." };
  const self = room.students.find(student => student.student_id === studentId)!;
  return {
    phase, confirmedAt: view.finalizedAt, assigned: true as const,
    building: view.effectiveLayout.find(building => room.id.startsWith(building.id + "/"))?.name ?? "",
    room: room.number, capacity: room.capacity,
    bed: room.beds.findIndex(student => student?.student_id === studentId) + 1,
    roomScore: room.score,
    comparisons: room.students.filter(student => student.student_id !== studentId).map((roommate, index) => ({
      label: `룸메이트 ${index + 1}`, ...explainRoommates(self, roommate),
    })),
  };
}

export type StudentAssignmentResult = NonNullable<ReturnType<typeof studentAssignmentResult>>;
