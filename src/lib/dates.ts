/** CSRC dates are M/D/YYYY. Returns YYYY-MM-DD (sortable) or "" when unparseable. */
export function iso(mdy: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdy.trim());
  if (!m) return "";
  return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}
