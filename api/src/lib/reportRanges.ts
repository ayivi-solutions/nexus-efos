// A shared, standardized set of report date ranges — meant to be reused
// across every report in the platform, not just Financial Statements.
// Deliberately distinguishes CALENDAR-ALIGNED periods (e.g. "This Month"
// = the 1st to the last day of the current calendar month, regardless of
// today's date) from ROLLING windows (e.g. "Next One-Month" = today to
// today+1 month, a moving range that shifts with today's date) — these
// are genuinely different things a lot of reporting systems conflate.
export type ReportRangeId =
  | "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "THIS_QUARTER" | "THIS_HALF_YEAR" | "THIS_YEAR"
  | "TOMORROW" | "WEEK_TO_END" | "MONTH_TO_END" | "QUARTER_TO_END" | "HALF_YEAR_TO_END" | "YEAR_TO_END"
  | "NEXT_WEEK" | "NEXT_MONTH" | "NEXT_QUARTER" | "NEXT_HALF_YEAR" | "NEXT_YEAR"
  | "YESTERDAY" | "LAST_WEEK" | "LAST_MONTH" | "LAST_QUARTER" | "LAST_HALF_YEAR" | "LAST_YEAR"
  | "NEXT_ONE_WEEK" | "NEXT_ONE_MONTH" | "NEXT_3_MONTHS" | "NEXT_6_MONTHS" | "NEXT_ONE_YEAR"
  | "LAST_ONE_WEEK" | "LAST_ONE_MONTH" | "LAST_3_MONTHS" | "LAST_6_MONTHS" | "LAST_ONE_YEAR"
  | "CUSTOM";

export const REPORT_RANGE_LABELS: Record<ReportRangeId, string> = {
  TODAY: "Today", THIS_WEEK: "This Week", THIS_MONTH: "This Month", THIS_QUARTER: "This Quarter",
  THIS_HALF_YEAR: "This Half-Year", THIS_YEAR: "This Year", TOMORROW: "Tomorrow",
  WEEK_TO_END: "Week-to-end", MONTH_TO_END: "Month-to-end", QUARTER_TO_END: "Quarter-to-end",
  HALF_YEAR_TO_END: "Half-Year-to-end", YEAR_TO_END: "Year-to-end",
  NEXT_WEEK: "Next Week", NEXT_MONTH: "Next Month", NEXT_QUARTER: "Next Quarter",
  NEXT_HALF_YEAR: "Next Half-Year", NEXT_YEAR: "Next Year",
  YESTERDAY: "Yesterday", LAST_WEEK: "Last Week", LAST_MONTH: "Last Month", LAST_QUARTER: "Last Quarter",
  LAST_HALF_YEAR: "Last Half-Year", LAST_YEAR: "Last Year",
  NEXT_ONE_WEEK: "Next One-Week", NEXT_ONE_MONTH: "Next One-Month", NEXT_3_MONTHS: "Next 3-Months",
  NEXT_6_MONTHS: "Next 6-Months", NEXT_ONE_YEAR: "Next One-Year",
  LAST_ONE_WEEK: "Last One-Week", LAST_ONE_MONTH: "Last One-Month", LAST_3_MONTHS: "Last 3-Months",
  LAST_6_MONTHS: "Last 6-Months", LAST_ONE_YEAR: "Last One-Year",
  CUSTOM: "Enter Date",
};

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
// Monday-start week, a common convention — Sunday=0 rolled to 7 so Monday=1..Sunday=7.
function startOfWeek(d: Date): Date { const r = startOfDay(d); const day = r.getDay() || 7; r.setDate(r.getDate() - (day - 1)); return r; }
function endOfWeek(d: Date): Date { const r = startOfWeek(d); r.setDate(r.getDate() + 6); return endOfDay(r); }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function startOfQuarter(d: Date): Date { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); }
function endOfQuarter(d: Date): Date { const q = Math.floor(d.getMonth() / 3); return endOfDay(new Date(d.getFullYear(), q * 3 + 3, 0)); }
function startOfHalfYear(d: Date): Date { const h = d.getMonth() < 6 ? 0 : 6; return new Date(d.getFullYear(), h, 1); }
function endOfHalfYear(d: Date): Date { const h = d.getMonth() < 6 ? 5 : 11; return endOfDay(new Date(d.getFullYear(), h + 1, 0)); }
function startOfYear(d: Date): Date { return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d: Date): Date { return endOfDay(new Date(d.getFullYear(), 11, 31)); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
function addYears(d: Date, n: number): Date { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; }

export interface DateRange { from: Date; to: Date; }

export function resolveReportRange(id: ReportRangeId, now: Date = new Date(), custom?: { from: string; to: string }): DateRange {
  const today = startOfDay(now);
  switch (id) {
    case "TODAY": return { from: today, to: endOfDay(today) };
    case "THIS_WEEK": return { from: startOfWeek(today), to: endOfWeek(today) };
    case "THIS_MONTH": return { from: startOfMonth(today), to: endOfMonth(today) };
    case "THIS_QUARTER": return { from: startOfQuarter(today), to: endOfQuarter(today) };
    case "THIS_HALF_YEAR": return { from: startOfHalfYear(today), to: endOfHalfYear(today) };
    case "THIS_YEAR": return { from: startOfYear(today), to: endOfYear(today) };
    case "TOMORROW": { const t = addDays(today, 1); return { from: t, to: endOfDay(t) }; }
    case "WEEK_TO_END": return { from: today, to: endOfWeek(today) };
    case "MONTH_TO_END": return { from: today, to: endOfMonth(today) };
    case "QUARTER_TO_END": return { from: today, to: endOfQuarter(today) };
    case "HALF_YEAR_TO_END": return { from: today, to: endOfHalfYear(today) };
    case "YEAR_TO_END": return { from: today, to: endOfYear(today) };
    case "NEXT_WEEK": { const n = addDays(startOfWeek(today), 7); return { from: n, to: endOfWeek(n) }; }
    case "NEXT_MONTH": { const n = addMonths(startOfMonth(today), 1); return { from: n, to: endOfMonth(n) }; }
    case "NEXT_QUARTER": { const n = addMonths(startOfQuarter(today), 3); return { from: n, to: endOfQuarter(n) }; }
    case "NEXT_HALF_YEAR": { const n = addMonths(startOfHalfYear(today), 6); return { from: n, to: endOfHalfYear(n) }; }
    case "NEXT_YEAR": { const n = addYears(startOfYear(today), 1); return { from: n, to: endOfYear(n) }; }
    case "YESTERDAY": { const y = addDays(today, -1); return { from: y, to: endOfDay(y) }; }
    case "LAST_WEEK": { const l = addDays(startOfWeek(today), -7); return { from: l, to: endOfWeek(l) }; }
    case "LAST_MONTH": { const l = addMonths(startOfMonth(today), -1); return { from: l, to: endOfMonth(l) }; }
    case "LAST_QUARTER": { const l = addMonths(startOfQuarter(today), -3); return { from: l, to: endOfQuarter(l) }; }
    case "LAST_HALF_YEAR": { const l = addMonths(startOfHalfYear(today), -6); return { from: l, to: endOfHalfYear(l) }; }
    case "LAST_YEAR": { const l = addYears(startOfYear(today), -1); return { from: l, to: endOfYear(l) }; }
    // Rolling windows — anchored on today, moving with it, NOT
    // calendar-aligned. Deliberately distinct from the NEXT_*/LAST_*
    // calendar cases above.
    case "NEXT_ONE_WEEK": return { from: today, to: endOfDay(addDays(today, 7)) };
    case "NEXT_ONE_MONTH": return { from: today, to: endOfDay(addMonths(today, 1)) };
    case "NEXT_3_MONTHS": return { from: today, to: endOfDay(addMonths(today, 3)) };
    case "NEXT_6_MONTHS": return { from: today, to: endOfDay(addMonths(today, 6)) };
    case "NEXT_ONE_YEAR": return { from: today, to: endOfDay(addYears(today, 1)) };
    case "LAST_ONE_WEEK": return { from: addDays(today, -7), to: endOfDay(today) };
    case "LAST_ONE_MONTH": return { from: addMonths(today, -1), to: endOfDay(today) };
    case "LAST_3_MONTHS": return { from: addMonths(today, -3), to: endOfDay(today) };
    case "LAST_6_MONTHS": return { from: addMonths(today, -6), to: endOfDay(today) };
    case "LAST_ONE_YEAR": return { from: addYears(today, -1), to: endOfDay(today) };
    case "CUSTOM":
      if (!custom) throw new Error("CUSTOM range requires from/to dates");
      return { from: startOfDay(new Date(custom.from)), to: endOfDay(new Date(custom.to)) };
  }
}
