// NL phone normalization. DB stores as country-code prefixed digits, no '+'.
// Examples:
//   "+31 6 12345678"   -> "31612345678"
//   "06-12345678"      -> "31612345678"
//   "0031612345678"    -> "31612345678"
//   "3197044514712"    -> "3197044514712"
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = "31" + digits.slice(1);
  }
  return digits;
}
