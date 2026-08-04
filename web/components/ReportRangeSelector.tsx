"use client";

// A shared, standardized report date-range selector — meant to be reused
// across every report in the platform, not just Financial Statements.
// Mirrors api/src/lib/reportRanges.ts's ReportRangeId set exactly, so a
// selection here maps directly to a server-side range with no separate
// translation layer to keep in sync.
export const REPORT_RANGES: { id: string; label: string }[] = [
  { id: "TODAY", label: "Today" }, { id: "THIS_WEEK", label: "This Week" }, { id: "THIS_MONTH", label: "This Month" },
  { id: "THIS_QUARTER", label: "This Quarter" }, { id: "THIS_HALF_YEAR", label: "This Half-Year" }, { id: "THIS_YEAR", label: "This Year" },
  { id: "TOMORROW", label: "Tomorrow" }, { id: "WEEK_TO_END", label: "Week-to-end" }, { id: "MONTH_TO_END", label: "Month-to-end" },
  { id: "QUARTER_TO_END", label: "Quarter-to-end" }, { id: "HALF_YEAR_TO_END", label: "Half-Year-to-end" }, { id: "YEAR_TO_END", label: "Year-to-end" },
  { id: "NEXT_WEEK", label: "Next Week" }, { id: "NEXT_MONTH", label: "Next Month" }, { id: "NEXT_QUARTER", label: "Next Quarter" },
  { id: "NEXT_HALF_YEAR", label: "Next Half-Year" }, { id: "NEXT_YEAR", label: "Next Year" },
  { id: "YESTERDAY", label: "Yesterday" }, { id: "LAST_WEEK", label: "Last Week" }, { id: "LAST_MONTH", label: "Last Month" },
  { id: "LAST_QUARTER", label: "Last Quarter" }, { id: "LAST_HALF_YEAR", label: "Last Half-Year" }, { id: "LAST_YEAR", label: "Last Year" },
  { id: "NEXT_ONE_WEEK", label: "Next One-Week" }, { id: "NEXT_ONE_MONTH", label: "Next One-Month" }, { id: "NEXT_3_MONTHS", label: "Next 3-Months" },
  { id: "NEXT_6_MONTHS", label: "Next 6-Months" }, { id: "NEXT_ONE_YEAR", label: "Next One-Year" },
  { id: "LAST_ONE_WEEK", label: "Last One-Week" }, { id: "LAST_ONE_MONTH", label: "Last One-Month" }, { id: "LAST_3_MONTHS", label: "Last 3-Months" },
  { id: "LAST_6_MONTHS", label: "Last 6-Months" }, { id: "LAST_ONE_YEAR", label: "Last One-Year" },
  { id: "CUSTOM", label: "Enter Date" },
];

export function ReportRangeSelector({ value, onChange, customFrom, customTo, onCustomChange }: {
  value: string; onChange: (v: string) => void;
  customFrom: string; customTo: string; onCustomChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {REPORT_RANGES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
      </select>
      {value === "CUSTOM" && (
        <>
          <input type="date" className="input" value={customFrom} onChange={(e) => onCustomChange(e.target.value, customTo)} />
          <input type="date" className="input" value={customTo} onChange={(e) => onCustomChange(customFrom, e.target.value)} />
        </>
      )}
    </div>
  );
}
