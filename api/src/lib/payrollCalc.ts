// doc §210 Payroll Processing / §212 Statutory Compliance. The single
// place PAYE and statutory contributions are calculated — reused by
// every payroll run, not reimplemented per feature. Tested directly
// against the GRA's own published worked cumulative-tax figures (not
// just internal consistency) before this touches a route, given the
// real financial and legal stakes of tax withholding.

export interface TaxBandInput { lowerBound: number; upperBound: number | null; rate: number; }

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Standard cumulative PAYE calculation: only the portion of chargeable
// income actually falling within each band is taxed at that band's rate.
export function calculatePAYE(chargeableIncome: number, bands: TaxBandInput[]): number {
  if (chargeableIncome <= 0) return 0;
  let tax = 0;
  for (const band of bands) {
    if (chargeableIncome <= band.lowerBound) continue;
    const upper = band.upperBound === null ? chargeableIncome : Math.min(chargeableIncome, band.upperBound);
    const taxableInBand = Math.max(0, upper - band.lowerBound);
    tax += taxableInBand * (band.rate / 100);
  }
  return round2(tax);
}

// doc §212.2 "Social Security Contributions" — a flat percentage of
// basic salary, capped at the insurable earnings ceiling and floored at
// the minimum insurable earning, per SSNIT's own published rules
// (confirmed via the person's official 2024 notice and a corroborating
// 2026 source for the current ceiling).
export function calculateStatutoryContribution(basicSalary: number, rate: number, ceiling: number | null, minimum: number | null): number {
  let base = basicSalary;
  if (minimum !== null && base < minimum) base = minimum;
  if (ceiling !== null && base > ceiling) base = ceiling;
  return round2(base * (rate / 100));
}
