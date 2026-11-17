import type { ModuleRow } from "./types";

export type Filters = {
  q: string;
  status: string[];
  type: string[];
  level: string[];
  embodiment: string[];
  standard: string[];
  family: string[];
  /** Exact algorithm names; a module must list every one (AND). */
  alg: string[];
  lab: string;
  /** Lists at least one post-quantum algorithm (ML-DSA, ML-KEM, SLH-DSA, LMS, XMSS). */
  pqc: boolean;
};

export const EMPTY_FILTERS: Filters = {
  q: "", status: [], type: [], level: [], embodiment: [], standard: [], family: [], alg: [], lab: "", pqc: false,
};

export type FacetKey = "status" | "type" | "level" | "embodiment" | "standard" | "family";
export const FACETS: Array<{ key: FacetKey; title: string }> = [
  { key: "status", title: "Status" },
  { key: "standard", title: "Standard" },
  { key: "type", title: "Module type" },
  { key: "level", title: "Overall level" },
  { key: "embodiment", title: "Embodiment" },
  { key: "family", title: "Algorithm family" },
];

export function isFilterActive(f: Filters): boolean {
  return JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);
}

function values(row: ModuleRow, key: FacetKey): string[] {
  if (key === "family") return row.families;
  return [row[key]];
}

function haystack(row: ModuleRow): string {
  return `${row.cert} ${row.vendor} ${row.module} ${row.caveat}`.toLowerCase();
}

/** Match all filters, optionally ignoring one facet (used to count that facet's options). */
export function matchesFilters(row: ModuleRow, f: Filters, ignore?: FacetKey): boolean {
  if (f.q) {
    const h = haystack(row);
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => h.includes(t))) return false;
  }
  for (const { key } of FACETS) {
    if (key === ignore || f[key].length === 0) continue;
    const vs = values(row, key);
    // family is AND (module covers every chosen family); the rest are OR within the facet.
    const ok = key === "family" ? f[key].every((v) => vs.includes(v)) : f[key].some((v) => vs.includes(v));
    if (!ok) return false;
  }
  if (f.alg.length && !f.alg.every((a) => row.algorithms.includes(a))) return false;
  if (f.pqc && row.pqc.length === 0) return false;
  if (f.lab && !row.labs.some((l) => l.toLowerCase().includes(f.lab.toLowerCase()))) return false;
  return true;
}

export type FacetOption = { option: string; count: number };

const LEVEL_ORDER = ["1", "2", "3", "4"];
const STATUS_ORDER = ["Active", "Historical", "Revoked"];

/** Options for each facet, counted against the other active filters. */
export function buildFacets(rows: ModuleRow[], f: Filters): Record<FacetKey, FacetOption[]> {
  const out = {} as Record<FacetKey, FacetOption[]>;
  for (const { key } of FACETS) {
    const counts = new Map<string, number>();
    for (const r of rows) for (const v of values(r, key)) if (v) counts.set(v, 0);
    for (const r of rows) {
      if (!matchesFilters(r, f, key)) continue;
      for (const v of values(r, key)) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const order = key === "level" ? LEVEL_ORDER : key === "status" ? STATUS_ORDER : null;
    out[key] = [...counts.entries()]
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) =>
        order
          ? order.indexOf(a.option) - order.indexOf(b.option)
          : key === "family"
            ? b.count - a.count || a.option.localeCompare(b.option)
            : a.option.localeCompare(b.option),
      );
  }
  return out;
}

// URL search params <-> Filters. Arrays are comma-joined so links stay readable.
export type ModulesSearch = Partial<Record<Exclude<keyof Filters, "pqc">, string>> & { pqc?: boolean; sort?: string; desc?: boolean };

export function searchToFilters(s: ModulesSearch): Filters {
  const arr = (x?: string) => (x ? x.split("|").filter(Boolean) : []);
  return {
    q: s.q ?? "", lab: s.lab ?? "", pqc: !!s.pqc,
    status: arr(s.status), type: arr(s.type), level: arr(s.level), embodiment: arr(s.embodiment),
    standard: arr(s.standard), family: arr(s.family), alg: arr(s.alg),
  };
}

export function filtersToSearch(f: Filters): ModulesSearch {
  const out: ModulesSearch = {};
  if (f.q) out.q = f.q;
  if (f.lab) out.lab = f.lab;
  if (f.pqc) out.pqc = true;
  for (const k of ["status", "type", "level", "embodiment", "standard", "family", "alg"] as const) {
    if (f[k].length) out[k] = f[k].join("|");
  }
  return out;
}
