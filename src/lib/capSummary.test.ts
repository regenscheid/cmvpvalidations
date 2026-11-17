import { describe, expect, it } from "vitest";
import { summarizeCaps } from "./capSummary";
import { familyOf } from "./family";

describe("summarizeCaps", () => {
  it("merges values across capability sets and ranks telling keys first", () => {
    const s = summarizeCaps([
      ["Functions: Encapsulation", "Parameter Sets: ML-KEM-512"],
      ["Parameter Sets: ML-KEM-768, ML-KEM-1024", "Functions: Decapsulation"],
    ]);
    expect(s).toBe("Parameter Sets: ML-KEM-512, ML-KEM-768, ML-KEM-1024 · Functions: Encapsulation, Decapsulation");
  });
  it("reads nested lines and truncates long value lists", () => {
    const s = summarizeCaps([["Capabilities:", "  Mode: SHA2-256", "  Returned Bits: 256"]], 1);
    expect(s).toBe("Mode: SHA2-256");
    expect(summarizeCaps([["Curve: a, b, c, d"]], 1, 2)).toBe("Curve: a, b +2");
  });
});

describe("familyOf", () => {
  it("groups like the Python build step", () => {
    expect(familyOf("ML-KEM EncapDecap")).toBe("ML-KEM");
    expect(familyOf("HMAC DRBG")).toBe("DRBG");
    expect(familyOf("Deterministic ECDSA SigGen (FIPS186-5)")).toBe("ECDSA");
    expect(familyOf("TLS v1.3 KDF")).toBe("KDF");
  });
});
