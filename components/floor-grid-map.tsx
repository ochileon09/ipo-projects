import { gridFromLegacyFloor, type AssignedRoom, type FloorLayout } from "@/lib/dormitory-layout";
import { spaceNames, spaceSymbols } from "@/lib/floor-grid";
import type { SurveyRow } from "@/lib/student-roster";

export function FloorGridMap({ floor, buildingId, rooms }: {floor:FloorLayout;buildingId:string;rooms:AssignedRoom<SurveyRow>[]}) {
  const grid=gridFromLegacyFloor(floor);
  const roomMap=new Map(rooms.map(room=>[room.id,room]));
  return <div className="grid-map-scroll"><div className="floor-grid-canvas assigned-grid" aria-label={`${floor.floor}층 공간 배치도`} style={{gridTemplateColumns:`repeat(${grid.cols}, minmax(126px, 1fr))`,gridAutoRows:"minmax(102px, auto)"}}>
    {grid.spaces.map(space=>{
      const room=roomMap.get(`${buildingId}/${floor.id}/${space.id}`);
      return <section key={space.id} className={"grid-map-space kind-"+space.kind} aria-label={space.kind==="room"?space.number+"호 배정":spaceNames[space.kind]} style={{gridColumn:`${space.col+1} / span ${space.colSpan}`,gridRow:`${space.row+1} / span ${space.rowSpan}`}}>
        {space.kind==="room"?<><div className="grid-map-room-heading"><strong>{space.number}</strong><span className="room-score" title="생활 패턴 유사성과 씻는 시간 분산을 반영한 적합도">{room?.score==null?"평가 대기":room.score.toFixed(1)+" / 10"}</span></div><small>{space.grade}학년 · {room?.students.length??0}/{space.capacity}명</small><div className="grid-room-occupants">{room?.students.map(student=><div key={student.id}><b>{student.student_name}</b><small>{student.student_id}{student.is_test?" · 테스트":student.is_default?" · 기본값":" · 실제"}</small></div>)}{!room?.students.length&&<em>빈 호실</em>}</div></>:space.kind!=="outside"?<><span className="grid-facility-symbol">{spaceSymbols[space.kind]}</span><strong>{spaceNames[space.kind]}</strong></>:<span className="sr-only">건물 밖</span>}
      </section>;
    })}
  </div></div>;
}
