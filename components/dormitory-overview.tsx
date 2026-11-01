"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminSession } from "./admin-session";
import { Icon } from "./icon";
import { supabase } from "@/lib/supabase/client";
import { useAdminRealtime } from "@/lib/supabase/use-admin-realtime";
import { buildDormitoryView, type SeparationRequest } from "@/lib/dormitory-view";
import { gridFromLegacyFloor, type DormLayout, type ManualAssignment } from "@/lib/dormitory-layout";
import { spaceNames } from "@/lib/floor-grid";
import type { SurveyRow } from "@/lib/student-roster";
import { hasDetailedHabits } from "@/lib/roommate-matching";

type Snapshot = {
  surveys: SurveyRow[]; avoidance_requests?: SeparationRequest[];
  school: { class_count: number; students_per_class: number; room_capacity: number };
  management: { layout: DormLayout | null; manual_assignments: ManualAssignment[]; include_defaults: boolean };
};

export function DormitoryOverview() {
  const { isAuthenticated, adminKey, status, restoreError, retryRestore, testEnabled } = useAdminSession();
  const [snapshot, setSnapshot] = useState<{ key: string; data: Snapshot } | null>(null);
  const [publicView,setPublicView] = useState<ReturnType<typeof buildDormitoryView>|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [selectedRooms, setSelectedRooms] = useState<Record<string,string>>({});
  const requestVersion = useRef(0);
  const activeKey = useRef("");
  activeKey.current = isAuthenticated ? adminKey : "public";

  const refresh = useCallback(async () => {
    const key = isAuthenticated ? adminKey : "public";
    if (activeKey.current !== key) return;
    const version = ++requestVersion.current;
    setLoading(true);
    if (!isAuthenticated) {
      try {
        const response=await fetch("/api/overview",{cache:"no-store"});
        if(!response.ok)throw new Error();
        const result=await response.json();
        if(version!==requestVersion.current||activeKey.current!==key)return;
        setPublicView(result);setError("");setUpdatedAt(new Date().toLocaleTimeString("ko-KR",{hour12:false}));
      } catch {if(version===requestVersion.current)setError("배정 정보를 불러오지 못했습니다.");}
      if(version===requestVersion.current)setLoading(false);
      return;
    }
    const { data, error: failure } = await supabase.rpc("get_dormitory_dashboard_by_key", { p_admin_key: adminKey });
    if (version !== requestVersion.current || activeKey.current !== adminKey) return;
    if (failure || !data?.school || !data?.management) setError("최신 배정 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    else {
      setSnapshot({ key: adminKey, data: data as Snapshot });
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
      setError("");
    }
    setLoading(false);
  }, [adminKey, isAuthenticated]);

  useEffect(() => {
    activeKey.current = isAuthenticated ? adminKey : "public";
    setSnapshot(null); setPublicView(null); setError(""); setUpdatedAt("");
    void refresh();
    return () => { requestVersion.current += 1; activeKey.current = ""; };
  }, [isAuthenticated, adminKey, refresh]);
  const syncState = useAdminRealtime(true, refresh);
  const current = isAuthenticated && snapshot?.key === adminKey ? snapshot.data : null;
  const privateView = useMemo(() => current ? buildDormitoryView({
    surveys: current.surveys.map(student => ({ ...student, is_default: false })),
    school: { classCount: current.school.class_count, studentsPerClass: current.school.students_per_class, roomCapacity: current.school.room_capacity },
    layout: current.management.layout,
    manualAssignments: current.management.manual_assignments ?? [],
    includeDefaults: current.management.include_defaults,
    testEnabled, avoidanceRequests: current.avoidance_requests,
  }) : null, [current, testEnabled]);
  const view = isAuthenticated ? privateView : publicView;

  if (status === "restoring") return <section className="overview-gate"><h2>현재 방 배치</h2>{restoreError ? <><p role="alert">{restoreError}</p><button type="button" onClick={retryRestore}>다시 확인</button></> : <p role="status">인증 상태를 확인하는 중입니다.</p>}</section>;


  const buildings = view?.effectiveLayout ?? [];
  const rooms = view?.allocation.rooms ?? [];
  const building = buildings.find(item => item.id === buildingId)
    ?? buildings.find(item => rooms.some(room => room.id.startsWith(item.id + "/") && room.students.length > 0))
    ?? buildings[0];
  const floors = [...(building?.floors ?? [])].sort((a, b) => b.floor - a.floor);
  const buildingRooms = building ? rooms.filter(room=>room.id.startsWith(building.id+"/")) : [];

  return <section className="overview" aria-labelledby="overview-title">
    <div className="overview-title"><div><h2 id="overview-title">현재 방 배치</h2><span className="overview-sync" role="status" aria-label="대시보드 동기화 상태">{error ? "연결 확인 필요" : syncState === "connected" ? "실시간 연결됨" : syncState === "connecting" ? "연결 중" : "연결 복구 중"}{updatedAt && ` · ${updatedAt}`}</span></div><div className="overview-controls"><span className="overview-mode">{testEnabled ? "테스트 포함" : "실제 운영"}{current?.management.include_defaults ? " · 미응답 포함" : ""}</span><button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()}>{loading ? "불러오는 중" : "새로고침"}</button></div></div>
    {error && <p className="notice error" role="alert">{error}{view && " 아래에는 마지막으로 불러온 배정이 표시됩니다."}</p>}
    {!view ? <p className="overview-loading" role="status">{error ? "배정 정보를 확인할 수 없습니다." : "배정 정보를 불러오는 중입니다."}</p> : <>
      <div className="overview-metrics" aria-label="현재 배정 요약">
        <article><span>설문 접수</span><strong>{view.roster.receivedStudents.length}<small>명</small></strong><p>전체 명단 {view.schoolRosterSize}명</p></article>
        <article><span>배정 인원</span><strong>{view.assignedCount}<small>명</small></strong><p>{view.occupiedRooms}개 호실 사용 중</p></article>
        <article><span>빈자리</span><strong>{view.totalBeds - view.assignedCount}<small>자리</small></strong><p>전체 수용 {view.totalBeds}명</p></article>
        <article><span>대기·확인 필요</span><strong>{view.waitingCount}<small>명</small></strong><p>자리·명단·분리 조건 확인</p></article>
      </div>
      <div className="overview-map-panel">
        <div className="overview-map-toolbar"><div className="overview-filters"><label><span>건물</span><select value={building?.id ?? ""} onChange={event=>{setBuildingId(event.target.value);setSelectedRooms({});}}>{buildings.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><p>{floors.length}개 층 · {buildingRooms.length}개 방 · {buildingRooms.reduce((sum,room)=>sum+room.students.length,0)}/{buildingRooms.reduce((sum,room)=>sum+room.capacity,0)}명</p><Link className="help-link" href="/admin">배정 조정 <Icon name="arrow" size={15}/></Link></div>
        <div className="overview-map-caption overview-building-caption"><span><i/>배정된 방 <i/>빈방</span><small>호실을 누르면 입실 정보를 펼칩니다.</small></div>
        {floors.map(floor=>{
          const floorRooms=buildingRooms.filter(room=>room.id.startsWith(`${building.id}/${floor.id}/`));
          const grid=gridFromLegacyFloor(floor);
          const spaces=new Map(grid.spaces.map(space=>[`${building.id}/${floor.id}/${space.id}`,space]));
          const wings=[floorRooms.filter(room=>(spaces.get(room.id)?.col??0)<grid.cols/2),floorRooms.filter(room=>(spaces.get(room.id)?.col??0)>=grid.cols/2)];
          const facilities=Array.from(new Set(grid.spaces.filter(space=>space.kind!=="room"&&space.kind!=="outside"&&space.kind!=="corridor").map(space=>spaceNames[space.kind])));
          return <section key={floor.id} className="overview-floor" aria-label={`${building.name} ${floor.floor}층 전체 호실`}>
            <header><h3>{floor.floor}층</h3><span>{floorRooms.length}개 방 · {floorRooms.reduce((sum,room)=>sum+room.students.length,0)}/{floorRooms.reduce((sum,room)=>sum+room.capacity,0)}명</span><small>{facilities.join(" · ")}</small></header>
            <div className="overview-room-columns">{wings.map((wing,index)=><div className="overview-room-column" key={index}><h4>{index===0?"왼쪽 구역":"오른쪽 구역"}</h4>{wing.map(room=><div key={room.id} className="overview-room-item"><button type="button" className={`overview-room${room.students.length?" occupied":""}`} aria-expanded={selectedRooms[floor.id]===room.id} aria-controls={`detail-${room.id}`} aria-label={`${room.number}호 · ${room.grade}학년 · ${room.students.length}/${room.capacity}명`} onClick={()=>setSelectedRooms(previous=>({...previous,[floor.id]:previous[floor.id]===room.id?"":room.id}))}><strong>{room.number}호</strong><span>{room.grade}학년</span><span>{room.students.length}/{room.capacity}명</span><span aria-hidden="true">{selectedRooms[floor.id]===room.id?"−":"＋"}</span></button>{selectedRooms[floor.id]===room.id&&<div id={`detail-${room.id}`}><section className="overview-room-detail" aria-label={`${room.number}호 입실 정보`}><div className="overview-room-detail-title"><h3>{building.name} {room.number}호</h3><span>{room.grade}학년 · {room.capacity}인실</span><span className="overview-score">{room.score === null ? "평가 대기" : `${room.students.some(student => student.is_default || !hasDetailedHabits(student)) ? "임시 적합도" : "적합도"} ${room.score.toFixed(1)} / 10`}</span></div><ol>{room.beds.map((student, index) => <li key={index}><span className="overview-bed-number">{index + 1}</span>{student ? <div><strong>{student.student_name}</strong><small>{student.student_id}{student.is_test ? " · 테스트" : student.is_default ? " · 미응답" : ""}</small></div> : <span className="overview-empty-bed">빈자리</span>}</li>)}</ol></section></div>}</div>)}{!wing.length&&<p className="overview-column-empty">호실 없음</p>}</div>)}</div>
          </section>;
        })}
      </div>
      <p className="overview-footnote">새 설문이 접수되면 자동 배정은 달라질 수 있습니다. 수동으로 고정한 자리는 유지됩니다.</p>
    </>}
  </section>;
}
