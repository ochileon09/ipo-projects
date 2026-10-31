"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { createFloorGrid, expandSelection, mergeGrid, moveGridSpace, paintGrid, selectedSpaces, spaceNames, spaceSymbols, splitGrid, type FloorGrid, type GridSelection, type SpaceKind } from "@/lib/floor-grid";
import { gridFromLegacyFloor, type FloorLayout, type Grade } from "@/lib/dormitory-layout";

export function FloorGridEditor({ floor, onChange, busy }: { floor: FloorLayout; onChange:(grid:FloorGrid)=>void; busy:boolean }) {
  const grid=useMemo(()=>gridFromLegacyFloor(floor),[floor]);
  const [selection,setSelection]=useState<GridSelection|null>(null);
  const firstRoom=grid.spaces.find(space=>space.kind==="room");
  const [kind,setKind]=useState<SpaceKind>("room"); const [grade,setGrade]=useState<Grade>(firstRoom?.grade??floor.leftGrade??1); const [capacity,setCapacity]=useState(firstRoom?.capacity??floor.leftCapacity??2);
  const [rows,setRows]=useState(4); const [cols,setCols]=useState(8); const [hover,setHover]=useState({rows:4,cols:8}); const [fillRooms,setFillRooms]=useState(true);
  const [message,setMessage]=useState(""); const [moving,setMoving]=useState<string|null>(null);
  const [historySize,setHistorySize]=useState({past:0,future:0});
  const past=useRef<FloorGrid[]>([]); const future=useRef<FloorGrid[]>([]);
  const drag=useRef<{row:number;col:number}|null>(null); const anchor=useRef<{row:number;col:number}|null>(null);
  const picked=selectedSpaces(grid,selection); const single=picked.length===1?picked[0]:null;
  function commit(next:FloorGrid,clear=false) {
    if(JSON.stringify(next)===JSON.stringify(grid)) return;
    past.current=[...past.current.slice(-39),grid]; future.current=[];
    setHistorySize({past:past.current.length,future:0}); setMessage(""); setMoving(null);
    if(clear) {setSelection(null);anchor.current=null;}
    onChange(next);
  }
  function travel(back:boolean) {
    const source=back?past.current:future.current; const target=back?future.current:past.current;
    const next=source.pop(); if(!next)return; target.push(grid);
    setHistorySize({past:past.current.length,future:future.current.length});setSelection(null);setMoving(null);setMessage("");onChange(next);
  }
  function point(event:PointerEvent<HTMLDivElement>) {
    const cell=(event.target as HTMLElement).closest<HTMLElement>("[data-grid-row]");
    return cell?{row:Number(cell.dataset.gridRow),col:Number(cell.dataset.gridCol)}:null;
  }
  function begin(event:PointerEvent<HTMLDivElement>) {
    if(event.button!==0||busy)return; const p=point(event);if(!p)return;
    if(moving) {
      try {commit(moveGridSpace(grid,moving,p.row,p.col),true);} catch(error) {setMessage((error as Error).message);}
      return;
    }
    const start=event.shiftKey&&anchor.current?anchor.current:p;
    anchor.current=start;drag.current=start;setSelection(expandSelection(grid,start,p));setMessage("");
  }
  return <div className="grid-designer">
    <div className="grid-designer-intro"><div><h3>층 구조 편집</h3></div><div className="grid-history"><button type="button" className="secondary-button" disabled={busy||!historySize.past} onClick={()=>travel(true)}>↶ 실행 취소</button><button type="button" className="secondary-button" disabled={busy||!historySize.future} onClick={()=>travel(false)}>↷ 다시 실행</button></div></div>
    <details className="grid-generator"><summary>＋ 새 격자 만들기</summary><div className="grid-generator-body">
      <div><strong>{hover.rows}행 × {hover.cols}열</strong><div className="grid-size-picker" onPointerLeave={()=>setHover({rows,cols})}>{Array.from({length:96},(_,i)=>{const r=Math.floor(i/12)+1;const c=i%12+1;return <button type="button" key={i} aria-label={`${r}행 ${c}열 선택`} className={r<=hover.rows&&c<=hover.cols?"is-highlighted":""} onPointerEnter={()=>setHover({rows:r,cols:c})} onFocus={()=>setHover({rows:r,cols:c})} disabled={busy} onClick={()=>{setRows(r);setCols(c);setHover({rows:r,cols:c});}}/>;})}</div></div>
      <div className="grid-size-settings"><label>세로 행 수<input type="number" min={1} max={24} value={rows} onChange={e=>{setRows(Number(e.target.value));setHover({rows:Number(e.target.value),cols});}} /></label><label>가로 열 수<input type="number" min={1} max={24} value={cols} onChange={e=>{setCols(Number(e.target.value));setHover({rows,cols:Number(e.target.value)});}} /></label><label className="check-label"><input type="checkbox" checked={fillRooms} onChange={e=>setFillRooms(e.target.checked)}/>호실로 채워 만들기</label><button type="button" disabled={busy||![rows,cols].every(n=>Number.isInteger(n)&&n>=1&&n<=24)} onClick={()=>commit(createFloorGrid(rows,cols,floor.floor,grade,capacity,fillRooms),true)}>이 크기로 새 틀 만들기</button><small>초안에 적용 · 구조 저장 시 DB 반영</small></div>
    </div></details>
    <fieldset className="grid-tools" disabled={busy}><legend>선택 영역에 적용할 공간</legend><div className="space-palette">{(Object.keys(spaceNames) as SpaceKind[]).map(type=><button type="button" key={type} className={"space-tool kind-"+type+(kind===type?" active":"")} aria-pressed={kind===type} onClick={()=>setKind(type)}><span>{spaceSymbols[type]}</span>{spaceNames[type]}</button>)}</div>
      <div className="grid-batch-settings"><label>적용 학년<select value={grade} onChange={e=>setGrade(Number(e.target.value) as Grade)}>{[1,2,3].map(g=><option key={g} value={g}>{g}학년</option>)}</select></label><label>적용 인실<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}인실</option>)}</select></label><button type="button" disabled={!selection} onClick={()=>selection&&commit(paintGrid(grid,selection,kind,floor.floor,grade,capacity))}>선택 영역 적용</button><button type="button" className="secondary-button" disabled={!selection||picked.length<2} onClick={()=>selection&&commit(mergeGrid(grid,selection,kind,floor.floor,grade,capacity))}>하나로 합치기</button><button type="button" className="secondary-button" disabled={!selection||!picked.some(s=>s.rowSpan*s.colSpan>1)} onClick={()=>selection&&commit(splitGrid(grid,selection,floor.floor))}>칸 나누기</button><button type="button" className="secondary-button" disabled={!single||single.kind==="outside"} onClick={()=>{setMoving(moving?null:single!.id);setMessage("");}}>{moving?"이동 취소":"선택 공간 이동"}</button></div>
    </fieldset>
    <div className="grid-selection-status" role="status"><span>{selection?`${selection.top+1}행 ${selection.left+1}열 ~ ${selection.bottom+1}행 ${selection.right+1}열 · 공간 ${picked.length}개 선택`:"편집할 칸을 선택하세요"}</span><small>{grid.rows}행 × {grid.cols}열 · 호실 {grid.spaces.filter(s=>s.kind==="room").length}개</small></div>
    {moving&&<p className="grid-hint">이동할 위치의 왼쪽 위 칸을 클릭하세요. 건물 밖으로 비운 위치에 놓을 수 있으며 호실 번호는 유지됩니다.</p>}
    {message&&<p className="notice error" role="alert">{message}</p>}
    <div className="grid-canvas-scroll"><div className={"floor-grid-canvas editable-grid"+(moving?" is-moving":"")} style={{gridTemplateColumns:`repeat(${grid.cols}, minmax(72px, 1fr))`,gridTemplateRows:`repeat(${grid.rows}, 64px)`}} aria-label={`${floor.floor}층 구조 편집 격자`} onPointerDown={begin} onPointerMove={event=>{if(event.buttons!==1){drag.current=null;return;}const p=point(event);if(drag.current&&p)setSelection(expandSelection(grid,drag.current,p));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={event=>{if(event.key==="Escape"){setSelection(null);setMoving(null);}}}>
      {grid.spaces.map(space=><button type="button" key={space.id} data-grid-row={space.row} data-grid-col={space.col} disabled={busy} className={"grid-space kind-"+space.kind+(picked.some(s=>s.id===space.id)?" selected":"")} style={{gridRow:`${space.row+1} / span ${space.rowSpan}`,gridColumn:`${space.col+1} / span ${space.colSpan}`}} aria-label={`${space.row+1}행 ${space.col+1}열 ${space.kind==="room"?space.number+"호":spaceNames[space.kind]}`} aria-pressed={picked.some(s=>s.id===space.id)} onClick={event=>{if(event.detail===0){const p={row:space.row,col:space.col};if(moving){try{commit(moveGridSpace(grid,moving,p.row,p.col),true);}catch(error){setMessage((error as Error).message);}return;}anchor.current=p;setSelection(expandSelection(grid,p));}}}><strong>{space.kind==="room"?space.number:spaceSymbols[space.kind]+" "+spaceNames[space.kind]}</strong>{space.kind==="room"&&<small>{space.grade}학년 · {space.capacity}인실</small>}{space.rowSpan*space.colSpan>1&&<em>{space.rowSpan}×{space.colSpan}</em>}</button>)}
    </div></div>
    {single?.kind==="room"&&<fieldset className="selected-room-settings" disabled={busy}><legend>선택한 호실 설정</legend><label>호실 번호<input maxLength={12} value={single.number} onChange={e=>commit({...grid,spaces:grid.spaces.map(s=>s.id===single.id?{...s,number:e.target.value}:s)})}/></label><label>사용 학년<select value={single.grade} onChange={e=>commit({...grid,spaces:grid.spaces.map(s=>s.id===single.id?{...s,grade:Number(e.target.value) as Grade}:s)})}>{[1,2,3].map(g=><option key={g} value={g}>{g}학년</option>)}</select></label><label>방당 인원<select value={single.capacity} onChange={e=>commit({...grid,spaces:grid.spaces.map(s=>s.id===single.id?{...s,capacity:Number(e.target.value)}:s)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}인실</option>)}</select></label></fieldset>}
  </div>;
}
