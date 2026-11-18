import "server-only";
import { createClient } from "@supabase/supabase-js";
import { buildDormitoryView, type FinalAssignment, type SeparationRequest, type SchoolSettings } from "../dormitory-view";
import type { DormLayout, ManualAssignment } from "../dormitory-layout";
import type { SurveyRow } from "../student-roster";

export type DashboardSnapshot = {
  surveys: SurveyRow[]; avoidance_requests?: SeparationRequest[];
  school: { class_count: number; students_per_class: number; room_capacity: number };
  management: { layout: DormLayout | null; manual_assignments: ManualAssignment[]; include_defaults: boolean; placement_revision: number; final_assignment?: FinalAssignment | null };
};

export function serverDatabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
}

export function viewFromSnapshot(data: DashboardSnapshot) {
  const school: SchoolSettings = { classCount: data.school.class_count, studentsPerClass: data.school.students_per_class, roomCapacity: data.school.room_capacity };
  return buildDormitoryView({ surveys: data.surveys, school, layout: data.management.layout,
    manualAssignments: data.management.manual_assignments ?? [], testEnabled: false, includeDefaults: data.management.include_defaults,
    avoidanceRequests: data.avoidance_requests ?? [], finalAssignment: data.management.final_assignment });
}
