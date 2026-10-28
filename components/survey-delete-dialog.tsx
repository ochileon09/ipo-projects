"use client";

import { useEffect, useRef } from "react";

export function SurveyDeleteDialog({ student, busy, error, onCancel, onDelete }: {
  student: { student_id: string; student_name: string }; busy: boolean; error: string; onCancel: () => void; onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="survey-delete-dialog" ref={dialog} aria-labelledby="delete-survey-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="delete-survey-title">이 설문을 삭제할까요?</h2>
    <p><strong>{student.student_id} · {student.student_name}</strong></p>
    <p>접수 명단과 방 배정에서 제외됩니다. 삭제 후에는 ‘삭제된 설문’에서 복구할 수 있습니다.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel} autoFocus>취소</button><button type="button" className="delete-survey-confirm" disabled={busy} onClick={onDelete}>{busy ? "삭제 중..." : "설문 삭제"}</button></div>
  </dialog>;
}
