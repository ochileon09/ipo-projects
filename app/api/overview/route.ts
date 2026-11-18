import { NextResponse } from "next/server";
import { serverDatabase, viewFromSnapshot, type DashboardSnapshot } from "@/lib/supabase/dashboard-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const db=serverDatabase();
  const {data,error}=await db.rpc("get_dormitory_dashboard_by_key",{p_admin_key:process.env.SCHOOL_ADMIN_KEY ?? "12345"});
  if(error||!data?.school||!data?.management)return NextResponse.json({error:"배정 정보를 불러오지 못했습니다."},{status:503});
  const view=viewFromSnapshot(data as DashboardSnapshot);
  // Public visitors get occupancy only; identities, survey answers and request reasons stay private.
  const rooms=view.allocation.rooms.map(room=>({...room,students:room.students.map(()=>({student_name:"배정된 학생",student_id:""})),beds:room.beds.map(student=>student?{student_name:"배정된 학생",student_id:""}:null)}));
  return NextResponse.json({effectiveLayout:view.effectiveLayout,assignedCount:view.assignedCount,totalBeds:view.totalBeds,schoolRosterSize:view.schoolRosterSize,
    occupiedRooms:view.occupiedRooms,waitingCount:view.waitingCount,finalizedAt:view.finalizedAt,genderReviewRequired:view.genderReviewRequired,
    roster:{receivedStudents:Array(view.roster.receivedStudents.length).fill(null)},allocation:{rooms,waiting:[],validManual:[],inactiveManual:[],invalidManual:[]}},{headers:{"Cache-Control":"no-store"}});
}
