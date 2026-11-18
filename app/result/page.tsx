"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { StudentAssignmentResult } from "@/lib/student-result";
import { CompatibilityReasons } from "@/components/compatibility-reasons";

export default function ResultPage() {
  const [result, setResult] = useState<StudentAssignmentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  function clear() { version.current += 1; setResult(null); setError(""); setBusy(false); }
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const requestVersion = ++version.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/result", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ studentId: values.get("studentId"), studentName: values.get("studentName") }) });
      const data = await response.json();
      if (requestVersion !== version.current) return;
      if (!response.ok) setError(data.error ?? "결과를 불러오지 못했습니다."); else setResult(data);
    } catch { if (requestVersion === version.current) setError("연결을 확인한 뒤 다시 조회해 주세요."); }
    finally { if (requestVersion === version.current) setBusy(false); }
  }
  return <main className="student-result-page"><header className="page-title"><div><h1>내 배정 결과</h1><p>설문에 제출한 학번·이름으로 현재 배정과 생활 적합도를 확인하세요.</p></div><Link className="help-link" href="/help#result">도움말</Link></header>
    <form className="result-lookup" onSubmit={lookup} onChange={clear}>
      <label><span>학번</span><input name="studentId" required pattern="[1-3][1-9](0[1-9]|[12][0-9]|30)" maxLength={4} inputMode="numeric" placeholder="2602" autoComplete="off" /></label>
      <label><span>이름</span><input name="studentName" required maxLength={30} autoComplete="off" placeholder="설문에 입력한 이름" /></label>
      <button disabled={busy} type="submit">{busy ? "조회 중..." : "배정 결과 확인"}</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {result && <section className="student-result" aria-label="내 배정 조회 결과">
      <header><h2>{result.phase === "final" ? "최종 확정 배정" : "현재 임시 배정"}</h2><p>{result.confirmedAt ? new Date(result.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " 확정 · 확정 당시 답변과 점수 기준" : "새 설문이나 관리자 조정에 따라 달라질 수 있습니다."}</p></header>
      {!result.assigned ? <p role="status">{result.message}</p> : <>
        <div className="result-room"><div><strong>{result.building} {result.room}호</strong><span>{result.capacity}인실 · {result.bed}번 자리</span></div><div><span>방 생활 적합도</span><strong>{result.roomScore === null ? "평가 대기" : result.roomScore.toFixed(1) + " / 10"}</strong></div></div>
        {!result.comparisons.length ? <p>비교할 룸메이트가 없어 점수를 산출하지 않습니다.</p> : result.comparisons.map(comparison => <section className="result-comparison" key={comparison.label}>
          <h3>{comparison.label} · 호환 점수 <strong>{comparison.score.toFixed(1)} / 10</strong></h3><CompatibilityReasons reasons={comparison.reasons} />
        </section>)}
        <p className="reason-note">점수는 생활 습관을 비교한 지표이며 관계를 보장하지 않습니다. 학년·정원·관리자 승인 조건이나 수동 배치도 결과에 영향을 줍니다. 기본값·미응답 항목은 실제로 잘 맞는다는 근거로 보지 않습니다.</p>
      </>}
    </section>}
  </main>;
}
