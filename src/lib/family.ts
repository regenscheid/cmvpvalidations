// Mirrors FAMILIES in scripts/build_site_data.py: ordered, first match wins. Covers both the CAVP
// algorithm names FIPS 140-3 certificates use ("AES-CBC", "SHA2-256") and the broader names on
// FIPS 140-2 certificates ("AES", "SHS", "Triple-DES", "CVL").
export const FAMILY_RULES: Array<[RegExp, string]> = [
  [/^ML-DSA\b/, "ML-DSA"], [/^ML-KEM\b/, "ML-KEM"], [/^SLH-DSA\b/, "SLH-DSA"], [/^LMS\b/, "LMS"], [/^XMSS\b/, "XMSS"],
  [/^AES\b/, "AES"], [/^(TDES|Triple-DES|3DES|TDEA)\b/i, "TDES"], [/DRBG/, "DRBG"], [/^RNG\b|X9\.31|186-2.*RNG/, "RNG (legacy)"],
  [/^HMAC\b/, "HMAC"],
  [/^(SHS\b|SHA-1|SHA2-|SHA-\s?(1|224|256|384|512)\b)/, "SHA-1/SHA-2"],
  [/^(SHA-3|SHA3-|SHAKE|cSHAKE|KMAC|TupleHash|ParallelHash)/, "SHA-3 family"],
  [/ECDSA/, "ECDSA"], [/^EDDSA/i, "EdDSA"], [/^DSA\b/, "DSA"], [/^RSA\b/, "RSA"],
  [/^KAS\b/, "KAS"], [/^KTS\b/, "KTS"], [/^KDA\b/, "KDA"], [/KDF/, "KDF"],
  [/^CVL\b/, "CVL"], [/^Safe Primes/, "Safe Primes"], [/^Conditioning Component/, "Conditioning"],
];

export const FAMILY_ORDER = [...new Set(FAMILY_RULES.map(([, f]) => f)), "Other"];

export function familyOf(name: string): string {
  for (const [re, fam] of FAMILY_RULES) if (re.test(name)) return fam;
  return "Other";
}

/** CAVP rows a FIPS 140-2 "CVL" (component validation) entry can refer to. */
export const CVL_ROW = /Component|Primitive|^KDF\b|^kdf-|KDF (SSH|TLS|IKE|SNMP|SRTP|TPM|ANS)/i;
