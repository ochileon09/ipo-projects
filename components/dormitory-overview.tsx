"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminSession } from "./admin-session";
import { Icon } from "./icon";
import { supabase } from "@/lib/supabase/client";
import { useAdminRealtime } from "@/lib/supabase/use-admin-realtime";
import { buildDormitoryView } from "@/lib/dormitory-view";
import { gridFromLegacyFloor, type DormLayout, type ManualAssignment } from "@/lib/dormitory-layout";
import { spaceNames, spaceSymbols } from "@/lib/floor-grid";
import type { SurveyRow } from "@/lib/student-roster";
import { hasDetailedHabits } from "@/lib/roommate-matching";

type Snapshot = {
  surveys: SurveyRow[];
  school: { class_count: number; students_per_class: number; room_capacity: number };
  management: { layout: DormLayout | null; manual_assignments: ManualAssignment[]; include_defaults: boolean };
};

export function DormitoryOverview() {
  const { isAuthenticated, adminKey, status, restoreError, retryRestore, testEnabled } = useAdminSession();
  const [snapshot, setSnapshot] = useState<{ key: string; data: Snapshot } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const requestVersion = useRef(0);
  const activeKey = useRef("");
  activeKey.current = isAuthenticated ? adminKey : "";

  const refresh = useCallback(async () => {
    if (!activeKey.current || activeKey.current !== adminKey) return;
    const version = ++requestVersion.current;
    setLoading(true);
    const { data, error: failure } = await supabase.rpc("get_dormitory_dashboard_by_key", { p_admin_key: adminKey });
    if (version !== requestVersion.current || activeKey.current !== adminKey) return;
    if (failure || !data?.school || !data?.management) setError("최신 배정 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    else {
      setSnapshot({ key: adminKey, data: data as Snapshot });
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
      setError("");
    }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => {
    activeKey.current = isAuthenticated ? adminKey : "";
    setSnapshot(null); setError(""); setUpdatedAt("");
    if (isAuthenticated) void refresh();
    return () => { requestVersion.current += 1; activeKey.current = ""; };
  }, [isAuthenticated, adminKey, refresh]);
  const syncState = useAdminRealtime(isAuthenticated, refresh);
  const current = isAuthenticated && snapshot?.key === adminKey ? snapshot.data : null;
  const view = useMemo(() => current ? buildDormitoryView({
    surveys: current.surveys.map(student => ({ ...student, is_default: false })),
    school: { classCount: current.school.class_count, studentsPerClass: current.school.students_per_class, roomCapacity: current.school.room_capacity },
    layout: current.management.layout,
    manualAssignments: current.management.manual_assignments ?? [],
    includeDefaults: current.management.include_defaults,
    testEnabled,
  }) : null, [current, testEnabled]);

  if (status === "restoring") return <section className="overview-gate"><h2>현재 방 배치</h2>{restoreError ? <><p role="alert">{restoreError}</p><button type="button" onClick={retryRestore}>다시 확인</button></> : <p role="status">인증 상태를 확인하는 중입니다.</p>}</section>;
  if (!isAuthenticated) return <section className="overview-gate"><div><Icon name="building" size={26} /><h2>현재 방 배치</h2><p>관리자 인증 후 호실별 학생과 빈자리를 확인할 수 있습니다.</p></div><Link className="overview-manage-link" href="/admin">관리자 인증 <Icon name="arrow" size={16} /></Link></section>;

  const buildings = view?.effectiveLayout ?? [];
  const rooms = view?.allocation.rooms ?? [];
  const building = buildings.find(item => item.id === buildingId)
    ?? buildings.find(item => rooms.some(room => room.id.startsWith(item.id + "/") && room.students.length > 0))
    ?? buildings[0];
  const floors = [...(building?.floors ?? [])].sort((a, b) => a.floor - b.floor);
  const floor = floors.find(item => item.id === floorId)
    ?? floors.find(item => rooms.some(room => room.id.startsWith(`${building.id}/${item.id}/`) && room.students.length > 0))
    ?? floors[0];
  const floorRooms = floor ? rooms.filter(room => room.id.startsWith(`${building.id}/${floor.id}/`)) : [];
  const selectedRoom = floorRooms.find(room => room.id === roomId) ?? floorRooms.find(room => room.students.length > 0) ?? floorRooms[0];
  const roomsById = new Map(floorRooms.map(room => [room.id, room]));
  const grid = floor ? gridFromLegacyFloor(floor) : null;
  const floorAssigned = floorRooms.reduce((sum, room) => sum + room.students.length, 0);
  const floorCapacity = floorRooms.reduce((sum, room) => sum + room.capacity, 0);

  return <section className="overview" aria-labelledby="overview-title">
    <div className="overview-title"><div><h2 id="overview-title">현재 방 배치</h2><span className="overview-sync" role="status" aria-label="대시보드 동기화 상태">{error ? "연결 확인 필요" : syncState === "connected" ? "실시간 연결됨" : syncState === "connecting" ? "연결 중" : "연결 복구 중"}{updatedAt && ` · ${updatedAt}`}</span></div><div className="overview-controls"><span className="overview-mode">{testEnabled ? "테스트 포함" : "실제 운영"}{current?.management.include_defaults ? " · 미응답 포함" : ""}</span><button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()}>{loading ? "불러오는 중" : "새로고침"}</button></div></div>
    {error && <p className="notice error" role="alert">{error}{view && " 아래에는 마지막으로 불러온 배정이 표시됩니다."}</p>}
    {!view ? <p className="overview-loading" role="status">{error ? "배정 정보를 확인할 수 없습니다." : "배정 정보를 불러오는 중입니다."}</p> : <>
      <div className="overview-metrics" aria-label="현재 배정 요약">
        <article><span>설문 접수</span><strong>{view.roster.receivedStudents.length}<small>명</small></strong><p>전체 명단 {3 * current!.school.class_count * current!.school.students_per_class}명</p></article>
        <article><span>배정 인원</span><strong>{view.assignedCount}<small>명</small></strong><p>{view.occupiedRooms}개 호실 사용 중</p></article>
        <article><span>빈자리</span><strong>{view.totalBeds - view.assignedCount}<small>자리</small></strong><p>전체 수용 {view.totalBeds}명</p></article>
        <article><span>대기·확인 필요</span><strong>{view.waitingCount}<small>명</small></strong><p>자리 부족 또는 명단 확인</p></article>
      </div>
      <div className="overview-map-panel">
        <div className="overview-map-toolbar"><div className="overview-filters"><label><span>건물</span><select value={building?.id ?? ""} onChange={event => { setBuildingId(event.target.value); setFloorId(""); setRoomId(""); }}>{buildings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>층</span><select value={floor?.id ?? ""} onChange={event => { setBuildingId(building.id); setFloorId(event.target.value); setRoomId(""); }}>{floors.map(item => <option key={item.id} value={item.id}>{item.floor}층</option>)}</select></label></div><p>{floorRooms.length}개 방 · {floorAssigned}/{floorCapacity}명</p><Link className="help-link" href="/admin">배정 조정 <Icon name="arrow" size={15} /></Link></div>
        {grid && building && floor && <div className="overview-plan-scroll"><div className="overview-plan" role="group" aria-label={`${building.name} ${floor.floor}층 방 배치`} style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(58px, 1fr))`, minWidth: grid.cols * 64 - 6 }}>
          {grid.spaces.map(space => {
            const room = roomsById.get(`${building.id}/${floor.id}/${space.id}`);
            const position = { gridColumn: `${space.col + 1} / span ${space.colSpan}`, gridRow: `${space.row + 1} / span ${space.rowSpan}` };
            return room ? <button key={space.id} type="button" style={position} className={`overview-room${room.students.length ? " occupied" : ""}`} aria-pressed={selectedRoom?.id === room.id} aria-label={`${room.number}호 · ${room.grade}학년 · ${room.students.length}/${room.capacity}명`} onClick={() => { setBuildingId(building.id); setFloorId(floor.id); setRoomId(room.id); }}><strong>{room.number}</strong><span>{room.students.length}/{room.capacity}명</span></button>
              : <div key={space.id} style={position} className={`overview-space kind-${space.kind}`} aria-label={spaceNames[space.kind]}>{space.kind !== "outside" && space.kind !== "corridor" && <><span aria-hidden="true">{spaceSymbols[space.kind]}</span><small>{spaceNames[space.kind]}</small></>}</div>;
          })}
        </div></div>}
        <div className="overview-map-caption"><span><i />배정된 방 <i />빈방</span><small>호실을 선택하면 입실 학생을 확인할 수 있습니다.</small></div>
        {selectedRoom ? <section className="overview-room-detail" aria-label="선택한 호실"><div className="overview-room-detail-title"><h3>{building.name} {selectedRoom.number}호</h3><span>{selectedRoom.grade}학년 · {selectedRoom.capacity}인실</span><span className="overview-score">{selectedRoom.score === null ? "평가 대기" : `${selectedRoom.students.some(student => student.is_default || !hasDetailedHabits(student)) ? "임시 적합도" : "적합도"} ${selectedRoom.score.toFixed(1)} / 10`}</span></div><ol>{selectedRoom.beds.map((student, index) => <li key={index}><span className="overview-bed-number">{index + 1}</span>{student ? <div><strong>{student.student_name}</strong><small>{student.student_id}{student.is_test ? " · 테스트" : student.is_default ? " · 미응답" : ""}</small></div> : <span className="overview-empty-bed">빈자리</span>}</li>)}</ol></section> : <p className="overview-loading">이 층에는 배정 가능한 호실이 없습니다.</p>}
      </div>
      <p className="overview-footnote">새 설문이 접수되면 자동 배정은 달라질 수 있습니다. 수동으로 고정한 자리는 유지됩니다.</p>
    </>}
  </section>;
}
