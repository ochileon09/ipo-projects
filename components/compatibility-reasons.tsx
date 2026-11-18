import type { CompatibilityReason } from "@/lib/roommate-matching";

const labels = { good: "잘 맞음", difference: "조율 필요", neutral: "감점 없음", unknown: "참고·기본값" };

export function CompatibilityReasons({ reasons }: { reasons: CompatibilityReason[] }) {
  return <ul className="compatibility-reasons">{reasons.filter(reason => reason.key !== "alarm").map(reason => <li key={reason.key} className={"reason-" + reason.assessment}>
    <div><strong>{reason.label}</strong><span>{labels[reason.assessment]}</span></div><p>{reason.summary}</p>
  </li>)}</ul>;
}
