export type Gender = "male" | "female" | "unknown";
export type KnownGender = Exclude<Gender, "unknown">;
export type GenderPolicy = Gender | "inherit" | "separate";
export type GenderProfile = {
  student_id: string; student_name: string; gender: Gender; verified: boolean;
  checked_reported_gender: Gender; verified_at?: string | null;
};
export const genderLabels: Record<Gender, string> = { male: "남학생", female: "여학생", unknown: "미확인" };
export const genderPolicyLabels: Record<GenderPolicy, string> = { male: "남학생 전용", female: "여학생 전용", unknown: "미설정 · 배정 제외", inherit: "상위 설정 따름", separate: "하위 구역에서 구분" };
export const genderPolicies: GenderPolicy[] = ["inherit", "unknown", "male", "female", "separate"];

export function verifiedGender(student: { gender?: Gender; gender_verified?: boolean }): Gender {
  return student.gender_verified && (student.gender === "male" || student.gender === "female") ? student.gender : "unknown";
}

export function resolveGenderPolicy(parent: GenderPolicy, child?: GenderPolicy): GenderPolicy | "conflict" {
  const next = child ?? "inherit";
  if (next === "inherit") return parent;
  if (parent === "unknown" || next === "unknown") return "unknown";
  if (parent === "separate" || parent === next) return next;
  return "conflict";
}

export function roomGender(policy: GenderPolicy | "conflict"): Gender {
  return policy === "male" || policy === "female" ? policy : "unknown";
}
