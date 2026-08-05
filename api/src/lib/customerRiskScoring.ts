// doc §29.3 "Risk scoring" — a real, disclosed default methodology, not
// an arbitrary black box. Genuinely different from the loan-specific
// Credit Assessment risk score (§64) already built — this one reflects
// KYC/AML risk (identity, screening, compliance status), not
// creditworthiness. Stored with its full component breakdown, the same
// "visible reasoning, not a black box" pattern already used for §64.
//
// These specific weights are a sensible, standard-AML-practice-inspired
// starting default — genuinely adjustable, since they live in exactly
// one place — not a confirmed regulatory or institutional figure the
// way the GRA tax bands were. Worth reviewing against the institution's
// actual risk policy before relying on this for real compliance
// decisions.
export interface CustomerRiskFactors {
  watchlistFlag: boolean;
  pepStatus: "NOT_PEP" | "DOMESTIC_PEP" | "FOREIGN_PEP" | "PEP_ASSOCIATE";
  kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
  possibleDuplicate: boolean;
  cddLevel: "STANDARD" | "ENHANCED";
}

export interface ScoreBreakdownItem { factor: string; points: number }

export function calculateCustomerRiskScore(factors: CustomerRiskFactors): { score: number; rating: "LOW" | "MEDIUM" | "HIGH"; breakdown: ScoreBreakdownItem[] } {
  const breakdown: ScoreBreakdownItem[] = [];

  if (factors.watchlistFlag) breakdown.push({ factor: "Watchlist match", points: 50 });
  if (factors.pepStatus !== "NOT_PEP") breakdown.push({ factor: `PEP status: ${factors.pepStatus.replaceAll("_", " ")}`, points: 30 });
  if (factors.kycStatus === "REJECTED") breakdown.push({ factor: "KYC rejected", points: 25 });
  if (factors.kycStatus === "PENDING") breakdown.push({ factor: "KYC pending", points: 10 });
  if (factors.possibleDuplicate) breakdown.push({ factor: "Flagged as possible duplicate", points: 10 });
  if (factors.cddLevel === "ENHANCED") breakdown.push({ factor: "Enhanced due diligence required", points: 15 });

  const score = Math.min(100, breakdown.reduce((s, b) => s + b.points, 0));
  const rating: "LOW" | "MEDIUM" | "HIGH" = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";

  return { score, rating, breakdown };
}

// doc §35.3 "Duplicate Detection" / "Similarity Scoring" — a real,
// deterministic scoring function based on actual identity fields, not
// a machine-learning fuzzy match (that's a genuinely different,
// heavier tool this platform doesn't have). Weighted toward the
// strongest, hardest-to-coincidentally-match identifiers first.
export interface CustomerIdentity {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  idNumber: string | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function calculateCustomerSimilarity(a: CustomerIdentity, b: CustomerIdentity): { score: number; matchedFields: string[] } {
  const matchedFields: string[] = [];
  let score = 0;

  if (a.idNumber && b.idNumber && a.idNumber.trim() === b.idNumber.trim()) { score += 50; matchedFields.push("idNumber"); }
  if (a.phone && b.phone && a.phone.trim() === b.phone.trim()) { score += 30; matchedFields.push("phone"); }
  if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) { score += 20; matchedFields.push("email"); }

  const nameA = normalizeName(a.fullName), nameB = normalizeName(b.fullName);
  if (nameA === nameB) { score += 20; matchedFields.push("fullName (exact)"); }
  else if (nameA.length > 3 && nameB.length > 3 && (nameA.includes(nameB) || nameB.includes(nameA))) { score += 10; matchedFields.push("fullName (partial)"); }

  return { score: Math.min(100, score), matchedFields };
}
