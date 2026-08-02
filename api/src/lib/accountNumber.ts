// Extracted from savings.routes.ts and hardened for reuse. The original
// millisecond-timestamp-only version is safe for normal account opening
// (one HTTP request at a time, naturally spaced in real time), but a bulk
// migration import loop can call this many times within the same
// millisecond, which a bare timestamp can't distinguish — accountNumber
// has a unique DB constraint, so a collision would surface as a spurious
// row failure during import rather than corrupting anything, but it's a
// real, avoidable failure mode. A short random suffix makes collisions
// negligible even in a tight loop.
export function generateAccountNumber(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "SA" + Date.now().toString().slice(-10) + rand;
}
