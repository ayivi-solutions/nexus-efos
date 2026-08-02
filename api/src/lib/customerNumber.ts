// doc §23.4 "Create unique customer numbers" — same hardened pattern as
// accountNumber.ts (timestamp + random suffix), since a bulk migration
// import creating many customers in a tight loop has the same collision
// risk a bare timestamp alone can't rule out.
export function generateCustomerNumber(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return "CU" + Date.now().toString().slice(-10) + rand;
}
