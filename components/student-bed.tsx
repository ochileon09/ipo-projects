"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BedAddress } from "@/lib/dormitory-layout";
import type { SurveyRow } from "@/lib/student-roster";

type PlacementInteraction = {
  activeStudent: SurveyRow | null; selectedId: string | null; draggingId: string | null;
  hover: string | null; busy: boolean; manualStudents: Set<string>;
  select: (target: BedAddress) => void; drop: (studentId: string, target: BedAddress) => void;
  drag: (studentId: string | null) => void; over: (target: string | null) => void;
};
const Context = createContext<PlacementInteraction | null>(null);
export function StudentPlacementProvider({ value, children }: { value: PlacementInteraction; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function StudentBed({ roomId, roomNumber, grade, bedIndex, student }: {
  roomId: string; roomNumber: string; grade: number; bedIndex: number; student: SurveyRow | null;
}) {
  const actions = useContext(Context);
  const pointer = useRef<{ x: number; y: number; id: string; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const target = { roomId, bedIndex };
  const address = JSON.stringify([roomId, bedIndex]);
  const compatible = actions?.activeStudent?.grade === grade;
  function targetAt(x: number, y: number): BedAddress | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('.student-bed[data-room-id][data-bed-index]');
    return element ? { roomId: element.dataset.roomId!, bedIndex: Number(element.dataset.bedIndex) } : null;
  }
  function cancelDrag() {
    pointer.current = null;
    setGhost(null);
    actions?.drag(null);
    actions?.over(null);
  }
  const content = <><i>{bedIndex + 1}</i>{student ? <div><b title={student.student_name}>{student.student_name}{actions?.manualStudents.has(student.student_id) && <span className="manual-student-badge">수동</span>}</b><small>{student.student_id} · 씻기 {student.shower_time.slice(0,5)}{student.is_default ? " · 기본값" : student.is_test ? " · 테스트" : " · 실제"}</small></div> : <em>빈 자리</em>}</>;
  const base = "compact-bed student-bed" + (student ? " occupied" : "");
  if (!actions) return <div className={base}>{content}</div>;
  return <><button type="button" className={base + (actions.selectedId === student?.student_id || actions.draggingId === student?.student_id ? " is-selected" : "") + (actions.hover === address ? compatible ? " is-drop-target" : " is-invalid-target" : "")}
    data-room-id={roomId} data-bed-index={bedIndex} data-student-id={student?.student_id ?? ""}
    aria-label={`${roomNumber}호 ${bedIndex+1}번 침대 · ${student ? student.student_name+" "+student.student_id : "빈 자리"}`}
    aria-pressed={!!student && actions.selectedId === student.student_id}
    disabled={actions.busy} draggable={false}
    title={student ? "드래그하거나 클릭해 옮길 학생을 선택하세요." : "학생을 놓거나 선택한 학생을 이 자리로 옮기세요."}
    onClick={() => { if (!suppressClick.current) actions.select(target); }}
    onDragStart={event => event.preventDefault()}
    onPointerDown={event => {
      if (!student || actions.busy || event.button !== 0) return;
      pointer.current = { x: event.clientX, y: event.clientY, id: student.student_id, active: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const start = pointer.current;
      if (!start || (!start.active && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6)) return;
      start.active = true;
      actions.drag(start.id);
      setGhost({ x: event.clientX, y: event.clientY });
      const over = targetAt(event.clientX, event.clientY);
      actions.over(over ? JSON.stringify([over.roomId, over.bedIndex]) : null);
    }}
    onPointerUp={event => {
      const start = pointer.current;
      cancelDrag();
      if (!start?.active) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      const over = targetAt(event.clientX, event.clientY);
      if (over) actions.drop(start.id, over);
    }}
    onPointerCancel={cancelDrag}
    onLostPointerCapture={() => { if (pointer.current?.active) cancelDrag(); }}
    onKeyDown={event => { if (event.key === "Escape") cancelDrag(); }}>
    {content}
  </button>{ghost&&student&&createPortal(<div className="student-drag-ghost" style={{left:ghost.x+14,top:ghost.y+14}}>{student.student_name} · {student.student_id}</div>,document.body)}</>;
}
