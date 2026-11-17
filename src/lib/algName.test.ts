import { describe, expect, it } from "vitest";
import { matchAlgorithm } from "./algName";

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
    expect(matchAlgorithm(rows, "AES-CBC")).toEqual({ hits: [rows[5]], approx: false });
  });
  it.each([
    ["RSA Signature Primitive", 0],
    ["AES-XTS", 1],
    ["SHAKE-128", 2],
    ["KDA OneStepNoCounter SP800-56Cr2", 3],
  ])("folds %s", (name, i) => {
    expect(matchAlgorithm(rows, name)).toEqual({ hits: [rows[i]], approx: true });
  });
  it("keeps FIPS 186 revisions apart", () => {
    expect(matchAlgorithm(rows, "ECDSA KeyGen (FIPS186-4)").hits).toEqual([]);
  });
});
