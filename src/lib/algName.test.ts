import { describe, expect, it } from "vitest";
import { matchAlgorithm, rowNames } from "./algName";

const rows = [
  { algorithm: "RSA Signature Primitive 2.0" },
  { algorithm: "AES-XTS Testing Revision 2.0" },
  { algorithm: "SHAKE-128 (FIPS 202)" },
  { algorithm: "KDA OneStepNoCounterKdf SP800-56Cr2" },
  { algorithm: "ECDSA KeyGen (FIPS186-5)" },
  { algorithm: "AES-CBC" },
];

describe("matchAlgorithm", () => {
  it("prefers exact names", () => {
    expect(matchAlgorithm(rows, "AES-CBC")).toEqual({ hits: [rows[5]], approx: false, how: "exact" });
  });
  it.each([
    ["RSA Signature Primitive", 0],
    ["AES-XTS", 1],
    ["SHAKE-128", 2],
    ["KDA OneStepNoCounter SP800-56Cr2", 3],
  ])("folds %s", (name, i) => {
    expect(matchAlgorithm(rows, name)).toEqual({ hits: [rows[i]], approx: true, how: "folded" });
  });
  it("keeps FIPS 186 revisions apart", () => {
    expect(matchAlgorithm(rows, "ECDSA KeyGen (FIPS186-4)").hits).toEqual([]);
  });
  it("maps FIPS 140-2 family names to rows", () => {
    expect(matchAlgorithm(rows, "AES", "A1", true).hits.map((r) => r.algorithm)).toEqual(["AES-XTS Testing Revision 2.0", "AES-CBC"]);
    expect(matchAlgorithm(rows, "SHA-3", "A1", true).how).toBe("family");
    expect(matchAlgorithm(rows, "CVL", "A1", true).hits).toEqual([rows[0]]);
  });
  it("takes every row of a legacy certificate", () => {
    const legacy = [{ algorithm: "SHA-1" }, { algorithm: "SHA-256" }];
    expect(matchAlgorithm(legacy, "SHS", "SHS 84", true).how).toBe("family");
    expect(matchAlgorithm(legacy, "HMAC-SHA-1", "SHS 84", true)).toEqual({ hits: legacy, approx: false, how: "all" });
  });
  it("leaves FIPS 140-3 names exact", () => {
    expect(matchAlgorithm(rows, "AES", "A1").how).toBe("none");
  });
  it("shortens row names", () => {
    expect(rowNames(["AES-CBC", "AES-CTR", "AES-CBC"])).toBe("CBC, CTR");
    expect(rowNames(["TDES-CBC", "TDES-ECB"])).toBe("CBC, ECB");
    expect(rowNames(["SHA-1", "SHA2-256"])).toBe("SHA-1, SHA2-256");
  });
});
