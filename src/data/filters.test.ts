import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, buildFacets, filtersToSearch, matchesFilters, searchToFilters } from "./filters";
import type { ModuleRow } from "./types";

const row = (over: Partial<ModuleRow>): ModuleRow => ({
  cert: 1, standard: "140-3", status: "Active", vendor: "Acme", module: "Acme Crypto", type: "Software",
  embodiment: "Multi-Chip Stand Alone", level: "1", sunset: "", first: "", last: "", labs: ["Lab A"], caveat: "",
  families: ["AES"], pqc: [], algorithms: ["AES-CBC"], cavp: [], sparse: false, esv: [], ...over,
});

const rows = [
  row({ cert: 1 }),
  row({ cert: 2, status: "Historical", families: ["AES", "ML-KEM"], algorithms: ["AES-CBC", "ML-KEM KeyGen"] }),
  row({ cert: 3, vendor: "Other", level: "2", families: ["ML-KEM"], algorithms: ["ML-KEM KeyGen"] }),
];

describe("matchesFilters", () => {
  it("matches every row with no filters", () => {
    expect(rows.every((r) => matchesFilters(r, EMPTY_FILTERS))).toBe(true);
  });
  it("ORs within a facet and ANDs families and algorithms", () => {
    const f = { ...EMPTY_FILTERS, status: ["Active", "Historical"], family: ["AES", "ML-KEM"] };
    expect(rows.filter((r) => matchesFilters(r, f)).map((r) => r.cert)).toEqual([2]);
    const g = { ...EMPTY_FILTERS, alg: ["ML-KEM KeyGen"] };
    expect(rows.filter((r) => matchesFilters(r, g)).map((r) => r.cert)).toEqual([2, 3]);
  });
  it("searches all words in cert, vendor and module", () => {
    expect(rows.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, q: "other crypto" })).map((r) => r.cert)).toEqual([3]);
  });
});

describe("buildFacets", () => {
  it("counts a facet against the other filters only", () => {
    const f = { ...EMPTY_FILTERS, status: ["Active"], level: ["2"] };
    const facets = buildFacets(rows, f);
    expect(facets.status).toEqual([{ option: "Active", count: 1 }, { option: "Historical", count: 0 }]);
    expect(facets.level).toEqual([{ option: "1", count: 1 }, { option: "2", count: 1 }]);
  });
});

describe("search params", () => {
  it("round-trips", () => {
    const f = { ...EMPTY_FILTERS, q: "x", alg: ["AES-CBC", "SHA2-256"], level: ["3"] };
    expect(searchToFilters(filtersToSearch(f))).toEqual(f);
  });
});

describe("year filter", () => {
  it("matches the year of first validation, and round-trips through the URL", () => {
    const a = row({ cert: 10, first: "3/14/2012" });
    const b = row({ cert: 11, first: "1/2/2019" });
    const f = { ...EMPTY_FILTERS, year: ["2012"] };
    expect([a, b].filter((r) => matchesFilters(r, f)).map((r) => r.cert)).toEqual([10]);
    expect(searchToFilters(filtersToSearch(f)).year).toEqual(["2012"]);
  });
});
