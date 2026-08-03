// doc §81.3 "Every collection generates a unique transaction number" —
// same collision-hardened pattern as account/customer numbers.
export function generateCollectionTransactionNumber(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "CT" + Date.now().toString().slice(-10) + rand;
}
