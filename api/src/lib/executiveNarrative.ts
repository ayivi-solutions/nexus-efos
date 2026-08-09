// Nexus EFOS EAIS §148.2 Executive and Board Intelligence — "dashboard
// narrative, trend and variance analysis". §148.5 is explicit: "Language
// models shall not fabricate strategic facts or consensus." §148.9
// requires every insight to show source, period, scope, method,
// assumptions and uncertainty, and to distinguish correlation, inference
// and scenario.
//
// Deliberately NOT a call to an LLM. Every sentence here is built from a
// real computed number comparing two real periods — templated text
// filling in real facts, not generative text that could invent a trend
// that didn't happen. This is the same transparent-computation
// discipline as lib/delinquencyRisk.ts and lib/collectorIntegrity.ts,
// applied to narrative instead of scoring.
//
// Scope is honest about what IS and ISN'T comparable: loan disbursement
// volume, savings flow, new customers and complaints are computed from
// real historical event timestamps (createdAt/disbursedAt), so a genuine
// month-over-month comparison is possible. Point-in-time ratios (PAR,
// CAR) are NOT trended here — retroactively knowing what PAR was a month
// ago would require historical arrears snapshots this platform doesn't
// keep, and presenting a fabricated "last month's PAR" would violate the
// same "shall not fabricate" rule this whole approach exists to satisfy.

export interface MonthMetrics {
  month: string; // "YYYY-MM"
  disbursed: number;
  deposits: number;
  withdrawals: number;
  newCustomers: number;
  complaints: number;
}

export interface NarrativeInsight {
  metric: string;
  currentValue: number;
  priorValue: number;
  percentChange: number | null; // null when priorValue is 0 (division is undefined, not "infinite growth")
  direction: "up" | "down" | "flat";
  sentence: string;
  // §148.9 "method" and "scope" — literally what this compares, so it
  // can be checked against the source data rather than trusted blindly.
  method: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return round1(((current - prior) / prior) * 100);
}

function directionOf(pct: number | null, current: number, prior: number): "up" | "down" | "flat" {
  if (pct === null) return current > prior ? "up" : current < prior ? "down" : "flat";
  if (Math.abs(pct) < 1) return "flat";
  return pct > 0 ? "up" : "down";
}

function money(n: number): string {
  return `GHS ${Math.round(n).toLocaleString()}`;
}

// Only the last two COMPLETE months compared — the current calendar
// month is always partial, so comparing it to a full prior month would
// make every month look like a decline near its start. A real, disclosed
// methodology choice, not an oversight.
export function generateDashboardNarrative(months: MonthMetrics[]): NarrativeInsight[] {
  if (months.length < 3) return []; // need at least current (excluded) + 2 complete months
  const complete = months.slice(0, -1); // drop the current, in-progress month
  const current = complete[complete.length - 1];
  const prior = complete[complete.length - 2];
  if (!current || !prior) return [];

  const insights: NarrativeInsight[] = [];

  function add(metric: string, currentValue: number, priorValue: number, format: (n: number) => string, noun: string) {
    const percentChange = pctChange(currentValue, priorValue);
    const direction = directionOf(percentChange, currentValue, priorValue);
    const changeText = percentChange !== null
      ? `${direction === "up" ? "up" : direction === "down" ? "down" : "flat versus"} ${Math.abs(percentChange)}%`
      : (currentValue > 0 ? "a new figure this month (no comparable prior month)" : "flat, both months at zero");
    const sentence = direction === "flat" && percentChange !== null
      ? `${noun} held steady at ${format(currentValue)} in ${current.month}, essentially unchanged from ${format(priorValue)} in ${prior.month}.`
      : `${noun} were ${format(currentValue)} in ${current.month}, ${changeText} from ${format(priorValue)} in ${prior.month}.`;
    insights.push({
      metric, currentValue, priorValue, percentChange, direction, sentence,
      method: `${current.month} vs ${prior.month}, both complete calendar months, computed from real recorded transaction timestamps.`,
    });
  }

  add("disbursed", current.disbursed, prior.disbursed, money, "Loan disbursements");
  add("deposits", current.deposits, prior.deposits, money, "Savings deposits");
  add("withdrawals", current.withdrawals, prior.withdrawals, money, "Savings withdrawals");
  add("newCustomers", current.newCustomers, prior.newCustomers, (n) => `${Math.round(n)}`, "New customers onboarded");
  add("complaints", current.complaints, prior.complaints, (n) => `${Math.round(n)}`, "Complaints filed");

  // Ranked by magnitude of relative change — "what moved most" is the
  // genuinely useful executive-attention signal (§148.2 "variance
  // analysis"), not just a list in a fixed order. Metrics with no
  // comparable prior value (percentChange null) sort last — an
  // "undefined %" isn't a meaningful magnitude to rank against real ones.
  insights.sort((a, b) => {
    if (a.percentChange === null && b.percentChange === null) return 0;
    if (a.percentChange === null) return 1;
    if (b.percentChange === null) return -1;
    return Math.abs(b.percentChange) - Math.abs(a.percentChange);
  });

  return insights;
}
