import { CVL_ROW, familyOf } from "./family";

/**
 * Certificate pages and CAVP validation pages sometimes spell the same algorithm differently
 * ("RSA Signature Primitive" vs "RSA Signature Primitive 2.0", "AES-XTS" vs "AES-XTS Testing
 * Revision 2.0", "SHAKE-128" vs "SHAKE-128 (FIPS 202)", "OneStepNoCounter" vs "OneStepNoCounterKdf").
 * This key folds those variants together; it never merges different FIPS 186 revisions.
 */
export function algKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(fips 202\)/g, "")
    .replace(/testing revision 2\.0/g, "")
    .replace(/\s2\.0\b/g, "")
    .replace(/onestepnocounterkdf/g, "onestepnocounter")
    .replace(/-\s+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Legacy (pre-ACVP) CAVP certificates are numbered per algorithm: "AES 4030", "Component 858". */
export const isLegacyCert = (cavpCert: string) => /^[A-Za-z][\w./-]* \d+$/.test(cavpCert);

/**
 * How a certificate's algorithm name maps to rows on a validation it cites:
 * - "exact" / "folded": same name (FIPS 140-3 certificates name CAVP algorithms directly);
 * - "family" (only with broadNames, i.e. FIPS 140-2/140-1 certificates): they name algorithms broadly ("AES", "SHS", "CVL"), so take every row of that family;
 * - "all": a legacy certificate covers a single algorithm type, so every row applies.
 */
export type MatchHow = "exact" | "folded" | "family" | "all" | "none";

export function matchAlgorithm<T extends { algorithm: string }>(
  rows: T[],
  name: string,
  cavpCert = "",
  broadNames = false,
): { hits: T[]; approx: boolean; how: MatchHow } {
  const exact = rows.filter((r) => r.algorithm === name);
  if (exact.length) return { hits: exact, approx: false, how: "exact" };
  const k = algKey(name);
  const folded = rows.filter((r) => algKey(r.algorithm) === k);
  if (folded.length) return { hits: folded, approx: true, how: "folded" };
  if (!broadNames) return { hits: [], approx: false, how: "none" };
  const fam = familyOf(name);
  if (fam !== "Other") {
    const byFam = rows.filter((r) => (fam === "CVL" ? CVL_ROW.test(r.algorithm) : familyOf(r.algorithm) === fam));
    if (byFam.length) return { hits: byFam, approx: false, how: "family" };
  }
  if (isLegacyCert(cavpCert) && rows.length) return { hits: rows, approx: false, how: "all" };
  return { hits: [], approx: false, how: "none" };
}

/** "AES-CBC, AES-CTR, AES-GCM" -> "CBC, CTR, GCM": drop a "XYZ-" prefix every name shares. */
export function rowNames(names: string[], max = 6): string {
  const uniq = [...new Set(names)];
  const pre = /^[^-\s]+-/.exec(uniq[0] ?? "")?.[0];
  const short = uniq.length > 1 && pre && uniq.every((n) => n.startsWith(pre) && n.length > pre.length) ? uniq.map((n) => n.slice(pre.length)) : uniq;
  return short.slice(0, max).join(", ") + (short.length > max ? ` +${short.length - max}` : "");
}
