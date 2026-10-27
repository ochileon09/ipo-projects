import type { MatchingStudent } from "./roommate-matching";

export type SurveyRow = MatchingStudent & {
  id: string; student_name: string; is_test: boolean; is_default: boolean; created_at: string;
};

export function isSchoolStudentId(studentId: string, classCount: number, studentsPerClass: number) {
  return /^[1-3][1-9][0-9]{2}$/.test(studentId) && Number(studentId[1]) <= classCount && Number(studentId.slice(2)) >= 1 && Number(studentId.slice(2)) <= studentsPerClass;
}

export function createDefaultRoster(classCount: number, studentsPerClass: number): SurveyRow[] {
  const students: SurveyRow[] = [];
  for (const grade of [1, 2, 3]) for (let classNo = 1; classNo <= classCount; classNo += 1) for (let seat = 1; seat <= studentsPerClass; seat += 1) {
    const studentId = String(grade) + String(classNo) + String(seat).padStart(2, "0");
    students.push({ id: "default-" + studentId, student_id: studentId, student_name: "미응답 " + studentId, grade, wake_time: "07:30:00", sleep_time: "00:30:00", shower_time: "07:40:00", shower_frequency: 1, tidiness: 3, noise_sensitivity: 3, preferred_temperature: 22, light_sensitivity: 3, ventilation_preference: 3, alarm_sensitivity: 3, room_activity: 3, is_test: false, is_default: true, created_at: "" });
  }
  return students;
}

export function selectRoster(surveys: SurveyRow[], classCount: number, studentsPerClass: number, testEnabled: boolean, includeDefaults: boolean) {
  const selected = new Map<string, SurveyRow>();
  [...surveys].filter(survey => testEnabled || !survey.is_test).sort((a, b) => Number(a.is_test) - Number(b.is_test) || Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id)).forEach(survey => {
    const studentId = survey.student_id.trim();
    if (!selected.has(studentId)) selected.set(studentId, { ...survey, student_id: studentId, grade: Number(studentId[0]), is_default: false });
  });
  const outsideRoster = [...selected.values()].filter(survey => !survey.is_test && !isSchoolStudentId(survey.student_id, classCount, studentsPerClass));
  const allStudents = createDefaultRoster(classCount, studentsPerClass).map(student => selected.get(student.student_id) ?? student);
  return { allStudents, activeStudents: allStudents.filter(student => includeDefaults || !student.is_default), outsideRoster };
}
