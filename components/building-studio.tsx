"use client";

import { useMemo, useState } from "react";
import { allocateDormitory, type DormLayout, type FloorLayout, type Grade, type ManualAssignment, newFloor, validateLayout } from "@/lib/dormitory-layout";
import type { SurveyRow } from "@/lib/student-roster";
import { FloorGridEditor } from "./floor-grid-editor";
import { FloorGridMap } from "./floor-grid-map";

export function BuildingStudio({ value, onChange, onSave, onAuto, busy, dirty, students, manualAssignments=[] }: {
  value:DormLayout;onChange:(layout:DormLayout)=>void;onSave:()=>void;onAuto:()=>void;
  busy:boolean;dirty:boolean;students:SurveyRow[];manualAssignments?:ManualAssignment[];
}) {
  const [buildingId,setBuildingId]=useState(value[0].id);
  const building=value.find(b=>b.id===buildingId)??value[0];const bi=value.indexOf(building);
  const [floorId,setFloorId]=useState(building.floors[0].id);
  const floor=building.floors.find(f=>f.id===floorId)??building.floors[0];const fi=building.floors.indexOf(floor);
  const [preview,setPreview]=useState(false);
  function updateBuilding(patch:Partial<DormLayout[number]>) {onChange(value.map((b,i)=>i===bi?{...b,...patch}:b));}
  function updateFloor(patch:Partial<FloorLayout>) {updateBuilding({floors:building.floors.map((f,i)=>i===fi?{...f,...patch}:f)});}
  const issue=validateLayout(value);
  const allocation=useMemo(()=>issue?null:allocateDormitory(students,value,manualAssignments),[issue,students,value,manualAssignments]);
  const beds=[1,2,3].map(grade=>allocation?.rooms.filter(r=>r.grade===grade).reduce((sum,r)=>sum+r.capacity,0)??0);
  return <details className="layout-editor">
    <summary><div><span className="eyebrow">BUILDING STUDIO</span><h2>건물 구조 직접 관리</h2><p>격자를 만들고 마우스로 공간을 선택해 우리 학교 지도를 그려보세요.</p></div><span className="editor-expand">펼치기 / 접기</span></summary>
    <div className="editor-body">
      <p className="editor-help">변경 내용은 초안으로 유지됩니다. 미리보기에서 수용 인원과 배정 대기를 확인한 뒤 저장하세요. 학교 명단이 바뀌어도 저장한 건물 구조는 유지됩니다.</p>
      <div className="building-tabs" aria-label="편집할 건물">{value.map(b=><button type="button" key={b.id} disabled={busy} className={b.id===building.id?"active":"secondary-button"} aria-pressed={b.id===building.id} onClick={()=>{setBuildingId(b.id);setFloorId(b.floors[0].id);setPreview(false);}}>{b.name}</button>)}<button type="button" className="secondary-button" disabled={busy||value.length>=8} onClick={()=>{const id=crypto.randomUUID();onChange([...value,{id,name:`새 건물 ${value.length+1}`,diningSide:"none",provisional:true,floors:[{...newFloor(1),leftRooms:4,rightRooms:4}]}]);setBuildingId(id);setFloorId("floor-1");setPreview(false);}}>＋ 건물 추가</button></div>
      <section className="building-editor">
        <fieldset className="building-editor-heading" disabled={busy}><label>건물 이름<input value={building.name} maxLength={30} onChange={e=>updateBuilding({name:e.target.value})}/></label><label>식당 방향<select value={building.diningSide} onChange={e=>updateBuilding({diningSide:e.target.value as "left"|"right"|"none"})}><option value="none">지정 안 함</option><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label><label className="check-label"><input type="checkbox" checked={building.provisional} onChange={e=>updateBuilding({provisional:e.target.checked})}/>임시 지도 표시</label><button type="button" className="secondary-button" disabled={value.length===1} onClick={()=>{onChange(value.filter(b=>b.id!==building.id));setPreview(false);}}>건물 제외</button></fieldset>
        <div className="floor-tabs" aria-label="편집할 층">{[...building.floors].sort((a,b)=>a.floor-b.floor).map(f=><button type="button" key={f.id} disabled={busy} className={f.id===floor.id?"active":"secondary-button"} aria-pressed={f.id===floor.id} onClick={()=>{setFloorId(f.id);setPreview(false);}}>{f.floor}층</button>)}<button type="button" className="secondary-button" disabled={busy||building.floors.length>=12} onClick={()=>{const n=Array.from({length:12},(_,i)=>i+1).find(n=>!building.floors.some(f=>f.floor===n));if(!n)return;const f={...newFloor(n),id:crypto.randomUUID(),leftRooms:4,rightRooms:4};updateBuilding({floors:[...building.floors,f]});setFloorId(f.id);setPreview(false);}}>＋ 층 추가</button></div>
        <div className="floor-editor-title"><label>층 번호<input type="number" min={1} max={12} disabled={busy} value={floor.floor} onChange={e=>updateFloor({floor:Number(e.target.value)})}/></label><div className="editor-view-tabs"><button type="button" className={!preview?"active":"secondary-button"} aria-pressed={!preview} onClick={()=>setPreview(false)}>구조 편집</button><button type="button" className={preview?"active":"secondary-button"} aria-pressed={preview} disabled={!!issue} onClick={()=>setPreview(true)}>배정 미리보기</button></div><button type="button" className="secondary-button" disabled={busy||building.floors.length===1} onClick={()=>{updateBuilding({floors:building.floors.filter(f=>f.id!==floor.id)});setPreview(false);}}>이 층 제외</button></div>
        {preview&&allocation&&<div className="draft-map-preview"><p className="grid-hint">저장 전 미리보기 · {building.name} {floor.floor}층. 현재 접수된 학생과 운영 모드로 계산한 임시 배정입니다.</p><FloorGridMap floor={floor} buildingId={building.id} rooms={allocation.rooms}/></div>}
        <div hidden={preview}><FloorGridEditor key={building.id+"/"+floor.id} floor={floor} busy={busy} onChange={grid=>updateFloor({grid})}/></div>
        {!floor.grid&&!preview&&<details className="legacy-room-generator"><summary>숫자로 좌우 호실 빠르게 조정</summary><fieldset className="wing-editor-grid" disabled={busy}>{(["left","right"] as const).map(wing=><div key={wing}><h3>{wing==="left"?"왼쪽":"오른쪽"} 구역</h3><div className="wing-inputs"><label>거주 학년<select value={floor[`${wing}Grade`]} onChange={e=>updateFloor({[`${wing}Grade`]:Number(e.target.value) as Grade})}>{[1,2,3].map(g=><option key={g} value={g}>{g}학년</option>)}</select></label><label>방 수<input type="number" min={0} max={49} value={floor[`${wing}Rooms`]} onChange={e=>updateFloor({[`${wing}Rooms`]:Number(e.target.value)})}/></label><label>인실<input type="number" min={1} max={6} value={floor[`${wing}Capacity`]} onChange={e=>updateFloor({[`${wing}Capacity`]:Number(e.target.value)})}/></label></div></div>)}</fieldset></details>}
      </section>
      <section className="draft-capacity" aria-label="저장 전 수용 인원"><div><small>초안의 학년별 수용 인원</small><strong>{beds.map((n,i)=>`${i+1}학년 ${n}명`).join(" · ")}</strong><span>전체 {beds.reduce((s,n)=>s+n,0)}명 · {allocation?.rooms.length??0}개 호실</span></div><div><small>이 구조로 배정 시</small><strong>{allocation?.waiting.length??0}명 배정 대기</strong><span>실제 응답 {allocation?.waiting.filter(s=>!s.is_test&&!s.is_default).length??0}명 포함 · 학년별 방·인실을 확인하세요</span></div></section>
      {issue&&<p className="notice error" role="alert">{issue}</p>}
      <div className="editor-actions"><span>{dirty?"저장하지 않은 변경 사항이 있습니다.":"현재 저장된 구조입니다."}</span><button type="button" className="secondary-button" onClick={onAuto} disabled={busy}>자동 구조로 복원</button><button type="button" disabled={busy||!!issue} onClick={onSave}>{busy?"저장 중...":dirty?"변경한 건물 구조 저장":"현재 구조를 직접 관리로 저장"}</button></div>
      <p className="editor-help">‘자동 구조로 복원’을 선택하면 학교 명단과 기본 인실에 맞춰 필요한 방 수를 다시 계산합니다. 현재 초안과 저장된 지도는 함께 바뀝니다.</p>
    </div>
  </details>;
}
