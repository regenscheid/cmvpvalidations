import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import type { SortingState } from "@tanstack/react-table";
import { FiltersPanel } from "../components/FiltersPanel";
import { ModulesTable } from "../components/ModulesTable";
import { Eyebrow, Gate, H1 } from "../components/ui";
import { buildFacets, filtersToSearch, matchesFilters, searchToFilters, type Filters, type ModulesSearch } from "../data/filters";
import { useModules } from "../data/load";
import type { ModuleRow } from "../data/types";

const KEYS = ["q", "lab", "status", "type", "level", "embodiment", "standard", "family", "alg"] as const;

export const Route = createFileRoute("/modules/")({
  validateSearch: (raw: Record<string, unknown>): ModulesSearch => {
    const out: ModulesSearch = {};
    for (const k of KEYS) {
      const v = raw[k];
      if (typeof v === "string" && v) out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    if (typeof raw.sort === "string") out.sort = raw.sort;
    if (raw.desc === true || raw.desc === "true") out.desc = true;
    if (raw.pqc === true || raw.pqc === "true") out.pqc = true;
    return out;
  },
  component: ModulesRoute,
});

function ModulesRoute() {
  const state = useModules();
  return (
    <Gate state={state} what="certificates">
      {(rows) => <ModulesView rows={rows} />}
    </Gate>
  );
}

function ModulesView({ rows }: { rows: ModuleRow[] }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = useMemo(() => searchToFilters(search), [search]);
  const sorting = useMemo<SortingState>(() => [{ id: search.sort ?? "cert", desc: search.sort ? !!search.desc : true }], [search.sort, search.desc]);
  const matched = useMemo(() => rows.filter((r) => matchesFilters(r, filters)), [rows, filters]);
  const facets = useMemo(() => buildFacets(rows, filters), [rows, filters]);
  const algorithmNames = useMemo(() => [...new Set(rows.flatMap((r) => r.algorithms))].sort(), [rows]);
  const labs = useMemo(() => [...new Set(rows.flatMap((r) => r.labs))].sort(), [rows]);

  const setFilters = (f: Filters) =>
    navigate({
      search: (prev) => {
        const keep: ModulesSearch = {};
        if (prev.sort) keep.sort = prev.sort;
        if (prev.desc) keep.desc = prev.desc;
        return { ...keep, ...filtersToSearch(f) };
      },
      replace: true,
    });
  const setSorting = (s: SortingState) =>
    navigate({
      search: (prev) => {
        const out: ModulesSearch = { ...prev };
        delete out.sort;
        delete out.desc;
        const first = s[0];
        if (first) {
          out.sort = first.id;
          if (first.desc) out.desc = true;
        }
        return out;
      },
      replace: true,
    });

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
      <FiltersPanel filters={filters} onChange={setFilters} facets={facets} algorithmNames={algorithmNames} labs={labs} matched={matched.length} total={rows.length} />
      <div className="min-w-0 space-y-3">
        <header className="space-y-1">
          <Eyebrow>Browse · CMVP certificates</Eyebrow>
          <H1 aside={`${matched.length.toLocaleString()} of ${rows.length.toLocaleString()}`}>Validated modules</H1>
          <p className="max-w-prose text-[13px] text-ink-2">
            Filters and sort live in the URL, so any view can be shared. Click a row for the full certificate and its CAVP algorithm validations.
          </p>
        </header>
        <ModulesTable rows={matched} sorting={sorting} onSortingChange={setSorting} />
      </div>
    </section>
  );
}
