"use client";

import { type DormLayout, type FloorLayout, type Grade, newFloor, validateLayout } from "@/lib/dormitory-layout";

export function DormitoryEditor({ value, onChange, onSave, onAuto, busy, dirty }: {
  value: DormLayout; onChange: (layout: DormLayout) => void; onSave: () => void;
  onAuto: () => void; busy: boolean; dirty: boolean;
}) {
  function updateBuilding(index: number, patch: Partial<DormLayout[number]>) {
    onChange(value.map((building, i) => i === index ? { ...building, ...patch } : building));
  }
  function updateFloor(buildingIndex: number, floorIndex: number, patch: Partial<FloorLayout>) {
    updateBuilding(buildingIndex, { floors: value[buildingIndex].floors.map((floor, i) => i === floorIndex ? { ...floor, ...patch } : floor) });
  }
  const issue = validateLayout(value);
  return <details className="layout-editor">
    <summary><div><span className="eyebrow">BUILDING EDITOR</span><h2>건물 구조 직접 관리</h2><p>건물·층·구역별 방 수, 인실, 학년과 공용 시설을 설정합니다.</p></div><span className="editor-expand">펼치기 / 접기</span></summary>
    <div className="editor-body">
      <p className="editor-help">저장한 구조가 실제 수용 정원이 됩니다. 같은 방의 학년은 하나로 유지되며, 자리가 부족하면 실제 응답자부터 배정합니다. 방 번호는 층 + 왼쪽부터의 순번으로 표시합니다. 변경 사항은 저장 후 지도에 반영됩니다.</p>
      {value.map((building, bi) => <section className="building-editor" key={building.id}>
        <div className="building-editor-heading">
          <label>건물 이름<input value={building.name} maxLength={30} onChange={event => updateBuilding(bi, { name: event.target.value })} /></label>
          <label>식당 방향<select value={building.diningSide} onChange={event => updateBuilding(bi, { diningSide: event.target.value as "left" | "right" | "none" })}><option value="none">지정 안 함</option><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label>
          <label className="check-label"><input type="checkbox" checked={building.provisional} onChange={event => updateBuilding(bi, { provisional: event.target.checked })} />임시 지도 표시</label>
          <button className="secondary-button" type="button" onClick={() => onChange(value.filter((_, i) => i !== bi))} disabled={value.length === 1}>건물 제외</button>
        </div>
        {building.floors.map((floor, fi) => <div className="floor-editor" key={floor.id}>
          <div className="floor-editor-title"><label>층 번호<input type="number" min={1} max={12} value={floor.floor} onChange={event => updateFloor(bi, fi, { floor: Number(event.target.value) })} /></label><button className="secondary-button" type="button" disabled={building.floors.length === 1} onClick={() => updateBuilding(bi, { floors: building.floors.filter((_, i) => i !== fi) })}>이 층 제외</button></div>
          <div className="wing-editor-grid">{(["left", "right"] as const).map(wing => <fieldset key={wing}><legend>{wing === "left" ? "왼쪽 구역" : "오른쪽 구역"}</legend><div className="wing-inputs">
            <label>거주 학년<select value={floor[`${wing}Grade`]} onChange={event => updateFloor(bi, fi, { [`${wing}Grade`]: Number(event.target.value) as Grade })}>{[1, 2, 3].map(grade => <option value={grade} key={grade}>{grade}학년</option>)}</select></label>
            <label>방 수<input type="number" min={0} max={49} value={floor[`${wing}Rooms`]} onChange={event => updateFloor(bi, fi, { [`${wing}Rooms`]: Number(event.target.value) })} /></label>
            <label>인실<input type="number" min={1} max={6} value={floor[`${wing}Capacity`]} onChange={event => updateFloor(bi, fi, { [`${wing}Capacity`]: Number(event.target.value) })} /></label>
          </div></fieldset>)}</div>
          <div className="facility-options">{([
            ["leftStairs", "왼쪽 계단"], ["centerStairs", "중앙 계단"], ["rightStairs", "오른쪽 계단"],
            ["leftWasher", "왼쪽 세탁기"], ["rightWasher", "오른쪽 세탁기"], ["leftDryer", "왼쪽 건조기"], ["rightDryer", "오른쪽 건조기"],
          ] as const).map(([key, label]) => <label className="check-label" key={key}><input type="checkbox" checked={floor[key]} onChange={event => updateFloor(bi, fi, { [key]: event.target.checked })} />{label}</label>)}</div>
        </div>)}
        <button className="secondary-button" type="button" disabled={building.floors.length >= 12} onClick={() => {
          const floorNo = Array.from({ length: 12 }, (_, i) => i + 1).find(number => !building.floors.some(floor => floor.floor === number));
          if (floorNo) updateBuilding(bi, { floors: [...building.floors, { ...newFloor(floorNo), id: crypto.randomUUID() }] });
        }}>+ 층 추가</button>
      </section>)}
      {issue && <p className="notice error" role="alert">{issue}</p>}
      <div className="editor-actions"><button className="secondary-button" type="button" disabled={value.length >= 8} onClick={() => onChange([...value, { id: crypto.randomUUID(), name: `새 건물 ${value.length + 1}`, diningSide: "none", provisional: true, floors: [newFloor(1)] }])}>+ 건물 추가</button><button className="secondary-button" type="button" onClick={onAuto} disabled={busy}>자동 구조로 복원</button><button type="button" disabled={busy || !!issue} onClick={onSave}>{busy ? "저장 중..." : dirty ? "변경한 건물 구조 저장" : "현재 구조를 직접 관리로 저장"}</button></div>
      <p className="editor-help">‘자동 구조로 복원’을 선택하면 학교 명단과 기본 인실에 맞춰 필요한 방 수를 다시 계산합니다.</p>
    </div>
  </details>;
}
