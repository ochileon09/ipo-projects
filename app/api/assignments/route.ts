import { NextResponse } from "next/server";
import { serverDatabase, viewFromSnapshot, type DashboardSnapshot } from "@/lib/supabase/dashboard-server";

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "요청을 확인해 주세요." }, { status: 400 }); }
  if (typeof body?.adminKey !== "string" || !["confirm", "unlock"].includes(body?.action) || !Number.isSafeInteger(body?.expectedRevision)) {
    return NextResponse.json({ error: "요청을 확인해 주세요." }, { status: 400 });
  }
  const db = serverDatabase();
  const { data, error } = await db.rpc("get_dormitory_dashboard_by_key", { p_admin_key: body.adminKey });
  if (error) return NextResponse.json({ error: error.code === "28000" ? "관리자 인증을 확인해 주세요." : "DB 조회에 실패했습니다." }, { status: error.code === "28000" ? 401 : 503 });
  const snapshot = data as DashboardSnapshot;
  if (snapshot.management.placement_revision !== body.expectedRevision) return NextResponse.json({ error: "새 설문이나 다른 관리자의 변경이 있습니다. 최신 배정표를 확인하고 다시 시도해 주세요." }, { status: 409 });
  const view = viewFromSnapshot(snapshot);
  if (body.action === "confirm" && view.genderWaitingCount) return NextResponse.json({ error: "성별 미확인 학생을 확인한 뒤 최종 확정해 주세요." }, { status: 400 });
  if (body.action === "confirm" && !view.assignedCount) return NextResponse.json({ error: "배정된 학생이 있어야 확정할 수 있습니다." }, { status: 400 });
  const result = body.action === "confirm"
    ? await db.rpc("confirm_dormitory_assignment_by_key", { p_admin_key: body.adminKey, p_expected_revision: body.expectedRevision,
      p_layout: view.effectiveLayout, p_rooms: view.allocation.rooms })
    : await db.rpc("unlock_dormitory_assignment_by_key", { p_admin_key: body.adminKey, p_expected_revision: body.expectedRevision });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: result.error.code === "40001" ? 409 : 400 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
