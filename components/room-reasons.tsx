import type { SurveyRow } from "@/lib/student-roster";
import { explainRoommates } from "@/lib/roommate-matching";
import { CompatibilityReasons } from "./compatibility-reasons";

export function RoomReasons({ students }: { students: SurveyRow[] }) {
  if (students.length < 2) return null;
  return <details className="room-reasons"><summary>점수·선정 이유</summary><p className="reason-note">생활 습관에 따른 비교 지표입니다. 학년·정원·분리 조건과 수동 배치도 함께 적용됩니다.</p>
    {students.flatMap((student, index) => students.slice(index + 1).map(roommate => {
      const comparison = explainRoommates(student, roommate);
      return <section key={student.id + "/" + roommate.id}><h4>{student.student_name} · {roommate.student_name} <span>{comparison.score.toFixed(1)} / 10</span></h4><CompatibilityReasons reasons={comparison.reasons} /></section>;
    }))}
  </details>;
}
