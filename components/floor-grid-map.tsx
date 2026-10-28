import { gridFromLegacyFloor, type AssignedRoom, type FloorLayout } from "@/lib/dormitory-layout";
import { spaceNames, spaceSymbols } from "@/lib/floor-grid";
import type { SurveyRow } from "@/lib/student-roster";
import { StudentBed } from "./student-bed";
import { hasDetailedHabits } from "@/lib/roommate-matching";

export function FloorGridMap({ floor, buildingId, rooms }: {floor:FloorLayout;buildingId:string;rooms:AssignedRoom<SurveyRow>[]}) {
  const grid=gridFromLegacyFloor(floor);
  const roomMap=new Map(rooms.map(room=>[room.id,room]));
  return <div className="grid-map-scroll"><div className="floor-grid-canvas assigned-grid" aria-label={`${floor.floor}층 공간 배치도`} style={{gridTemplateColumns:`repeat(${grid.cols}, minmax(126px, 1fr))`,gridAutoRows:"minmax(102px, auto)"}}>
    {grid.spaces.map(space=>{
      const room=roomMap.get(`${buildingId}/${floor.id}/${space.id}`);
      return <section key={space.id} className={"grid-map-space kind-"+space.kind} aria-label={space.kind==="room"?space.number+"호 배정":spaceNames[space.kind]} style={{gridColumn:`${space.col+1} / span ${space.colSpan}`,gridRow:`${space.row+1} / span ${space.rowSpan}`}}>
        {space.kind==="room"?<><div className="grid-map-room-heading"><strong>{space.number}</strong><span className="room-score" title="샤워 사용 구간의 겹침과 야간 소음·조명·알람을 반영한 적합도">{room?.score==null?"평가 대기":room.score.toFixed(1)+" / 10"}</span></div><small>{space.grade}학년 · {room?.students.length??0}/{space.capacity}명{room?.students.some(student=>!hasDetailedHabits(student))?" · 추가 문항 미응답":""}</small><div className="grid-room-occupants">{Array.from({length:space.capacity!},(_,bedIndex)=><StudentBed key={bedIndex} roomId={`${buildingId}/${floor.id}/${space.id}`} roomNumber={space.number!} grade={space.grade!} bedIndex={bedIndex} student={room?.beds[bedIndex]??null}/>)}</div></>:space.kind!=="outside"?<><span className="grid-facility-symbol">{spaceSymbols[space.kind]}</span><strong>{spaceNames[space.kind]}</strong></>:<span className="sr-only">건물 밖</span>}
      </section>;
    })}
  </div></div>;
}
