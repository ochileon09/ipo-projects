"use client";
import { useEffect, useRef } from "react";

export function AssignmentConfirmDialog({ unlock, assigned, waiting, busy, onCancel, onConfirm }: {
  unlock: boolean; assigned: number; waiting: number; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="survey-delete-dialog" ref={dialog} aria-labelledby="assignment-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="assignment-confirm-title">{unlock ? "최종 확정을 해제할까요?" : "이 배정표를 최종 확정할까요?"}</h2>
    <p>{unlock ? "확정 후 접수·수정된 설문과 현재 조건으로 자동 배정을 다시 계산합니다. 기존 자리가 바뀔 수 있습니다." : `현재 배정 ${assigned}명과 호실·자리·점수를 DB에 저장합니다. 대기·확인 필요 ${waiting}명은 배정표 밖에 남습니다.`}</p>
    {!unlock && <p>새 설문은 계속 접수하지만, 확정 해제 전까지 배치와 점수는 바뀌지 않습니다. 수동 이동·건물·명단·분리 조건 변경도 잠깁니다.</p>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy} autoFocus>취소</button><button type="button" onClick={onConfirm} disabled={busy}>{busy ? "저장 중..." : unlock ? "확정 해제" : "최종 확정·DB 저장"}</button></div>
  </dialog>;
}
