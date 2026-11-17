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
    .replace(/\s+/g, " ")
    .trim();
}

/** Capability rows on a validation for a certificate's algorithm name: exact first, then folded. */
export function matchAlgorithm<T extends { algorithm: string }>(rows: T[], name: string): { hits: T[]; approx: boolean } {
  const exact = rows.filter((r) => r.algorithm === name);
  if (exact.length) return { hits: exact, approx: false };
  const k = algKey(name);
  return { hits: rows.filter((r) => algKey(r.algorithm) === k), approx: true };
}
