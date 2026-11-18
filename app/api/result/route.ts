import { NextResponse } from "next/server";
import { serverDatabase, viewFromSnapshot, type DashboardSnapshot } from "@/lib/supabase/dashboard-server";
import { studentAssignmentResult } from "@/lib/student-result";

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "학번과 이름을 확인해 주세요." }, { status: 400 }); }
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  const studentName = typeof body?.studentName === "string" ? body.studentName.trim() : "";
  if (!/^[1-3][1-9](0[1-9]|[12][0-9]|30)$/.test(studentId) || !studentName || studentName.length > 30) {
    return NextResponse.json({ error: "제출한 네 자리 학번과 이름을 입력해 주세요." }, { status: 400 });
  }
  const { data, error } = await serverDatabase().rpc("get_dormitory_dashboard_by_key", { p_admin_key: process.env.SCHOOL_ADMIN_KEY ?? "12345" });
  if (error) return NextResponse.json({ error: "배정 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." }, { status: 503 });
  const result = studentAssignmentResult(viewFromSnapshot(data as DashboardSnapshot), studentId, studentName);
  if (!result) return NextResponse.json({ error: "일치하는 설문을 찾지 못했습니다. 제출한 학번과 이름을 확인해 주세요." }, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private" } });
}
