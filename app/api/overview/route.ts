import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDormitoryView } from "@/lib/dormitory-view";
export const dynamic = "force-dynamic";
export async function GET() {
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  const {data,error}=await db.rpc("get_dormitory_dashboard_by_key",{p_admin_key:process.env.SCHOOL_ADMIN_KEY ?? "12345"});
  if(error||!data?.school||!data?.management)return NextResponse.json({error:"배정 정보를 불러오지 못했습니다."},{status:503});
  const view=buildDormitoryView({surveys:data.surveys,school:{classCount:data.school.class_count,studentsPerClass:data.school.students_per_class,roomCapacity:data.school.room_capacity},layout:data.management.layout,manualAssignments:data.management.manual_assignments??[],testEnabled:false,includeDefaults:data.management.include_defaults,avoidanceRequests:data.avoidance_requests??[]});
  // Public visitors get occupancy only; identities, survey answers and request reasons stay private.
  const rooms=view.allocation.rooms.map(room=>({...room,students:room.students.map(()=>({student_name:"배정된 학생",student_id:""})),beds:room.beds.map(student=>student?{student_name:"배정된 학생",student_id:""}:null)}));
  return NextResponse.json({...view,roster:{receivedStudents:Array(view.roster.receivedStudents.length).fill(null)},allocation:{rooms,waiting:[],validManual:[],inactiveManual:[],invalidManual:[]}},{headers:{"Cache-Control":"no-store"}});
}
