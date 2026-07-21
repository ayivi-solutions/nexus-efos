// doc §16.6 — users shall receive clear error messages, no internal
// technical details. The API mostly already sends clean business-rule
// messages ("Insufficient balance", "Customer must be ACTIVE..."), but
// validation failures come through as JSON.stringify'd Zod errors — this
// extracts a readable message from those instead of showing raw JSON.
export function cleanErrorMessage(raw: string): string {
  if (!raw) return "Something went wrong. Please try again.";

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const fieldErrors = parsed.fieldErrors || {};
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors[firstField]?.[0]) {
        const label = firstField.replace(/([A-Z])/g, " $1").toLowerCase();
        return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${fieldErrors[firstField][0]}`;
      }
      if (parsed.formErrors?.[0]) return parsed.formErrors[0];
    } catch {
      // not JSON after all — fall through to raw message
    }
  }
  return trimmed;
}

export function generateRefId(): string {
  return "REF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
