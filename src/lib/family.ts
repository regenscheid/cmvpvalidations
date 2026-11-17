// Mirrors FAMILIES in scripts/build_site_data.py: ordered, first match wins.
export const FAMILY_RULES: Array<[RegExp, string]> = [
  [/^ML-DSA\b/, "ML-DSA"], [/^ML-KEM\b/, "ML-KEM"], [/^SLH-DSA\b/, "SLH-DSA"], [/^LMS\b/, "LMS"], [/^XMSS\b/, "XMSS"],
  [/^AES-/, "AES"], [/^TDES-/, "TDES"], [/DRBG/, "DRBG"], [/^HMAC-/, "HMAC"],
  [/^(SHA-1|SHA2-)/, "SHA-1/SHA-2"], [/^(SHA3-|SHAKE-|cSHAKE-|KMAC-|TupleHash|ParallelHash)/, "SHA-3 family"],
  [/ECDSA/, "ECDSA"], [/^EDDSA/, "EdDSA"], [/^DSA /, "DSA"], [/^RSA /, "RSA"],
  [/^KAS-/, "KAS"], [/^KTS-/, "KTS"], [/^KDA /, "KDA"], [/KDF/, "KDF"],
  [/^Safe Primes/, "Safe Primes"], [/^Conditioning Component/, "Conditioning"],
];

export const FAMILY_ORDER = [...new Set(FAMILY_RULES.map(([, f]) => f)), "Other"];

export function familyOf(name: string): string {
  for (const [re, fam] of FAMILY_RULES) if (re.test(name)) return fam;
  return "Other";
}
