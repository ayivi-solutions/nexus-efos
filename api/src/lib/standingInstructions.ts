// doc §58.4 Scheduling Options. A pure function computing the next
// execution date from a frequency — tested before it drives any real
// money movement.
//
// Known, disclosed limitation: MONTHLY/QUARTERLY/HALF_YEARLY/ANNUALLY use
// JavaScript's native Date rollover, which does not clamp to month-end.
// An instruction created on Jan 31 with MONTHLY frequency lands on Mar 3
// (Feb has no 31st), not Feb 28 — tested and confirmed as the actual
// behavior, not an oversight. Genuinely correct "same day, or last day
// if the month is shorter" semantics would need more logic than this
// pass includes; flagged here rather than silently shipped as a
// non-issue.
export type SIFrequency = "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY";

export function nextExecutionDate(from: Date, frequency: SIFrequency): Date {
  const d = new Date(from);
  switch (frequency) {
    case "DAILY": d.setDate(d.getDate() + 1); break;
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "FORTNIGHTLY": d.setDate(d.getDate() + 14); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "HALF_YEARLY": d.setMonth(d.getMonth() + 6); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}
