import { useState } from "react";
import { EMPTY_FILTERS, FACETS, isFilterActive, type FacetKey, type FacetOption, type Filters } from "../data/filters";
import { PQC_FAMILIES } from "../lib/pqc";

const inputCls =
  "mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none";
const legendCls = "font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3";
/** Short facets stay open; long ones (embodiment, algorithm family, ...) open on demand or when in use. */
const OPEN_BY_DEFAULT = new Set<FacetKey>(["status", "standard"]);

export function FiltersPanel({
  filters,
  onChange,
  facets,
  algorithmNames,
  labs,
  matched,
  total,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  facets: Record<FacetKey, FacetOption[]>;
  algorithmNames: string[];
  labs: string[];
  matched: number;
  total: number;
}) {
  const [algDraft, setAlgDraft] = useState("");
  const toggle = (key: FacetKey, v: string) =>
    onChange({ ...filters, [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] });
  const addAlg = (name: string) => {
    if (algorithmNames.includes(name) && !filters.alg.includes(name)) onChange({ ...filters, alg: [...filters.alg, name] });
    setAlgDraft("");
  };

  return (
    <aside
      className="space-y-4 rounded-md border border-line bg-surface p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overscroll-contain"
      aria-label="Filters"
    >
      <div className="flex items-baseline justify-between">
        <h2 className={legendCls}>Filters</h2>
        {isFilterActive(filters) && (
          <button type="button" className="text-xs text-ink-2 underline-offset-2 hover:underline" onClick={() => onChange(EMPTY_FILTERS)}>
            Reset
          </button>
        )}
      </div>
      <p className="text-xs text-ink-2">
        {matched.toLocaleString()} of {total.toLocaleString()} certificates
      </p>
      {filters.year.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {filters.year.map((y) => (
            <li key={y}>
              <button
                type="button"
                onClick={() => onChange({ ...filters, year: filters.year.filter((x) => x !== y) })}
                className="rounded-full border border-line bg-surface-2 px-2 py-[1px] text-[11px] hover:border-accent"
                aria-label={`Remove first validated ${y}`}
              >
                First validated {y} ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className={legendCls}>Search</span>
        <input type="search" value={filters.q} onChange={(e) => onChange({ ...filters, q: e.target.value })} placeholder="Cert, vendor, module…" className={inputCls} />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={filters.pqc} onChange={(e) => onChange({ ...filters, pqc: e.currentTarget.checked })} />
        <span>Lists a post-quantum algorithm</span>
      </label>

      <div>
        <label className="block">
          <span className={legendCls}>Has algorithm</span>
          <input
            type="search"
            list="alg-options"
            value={algDraft}
            placeholder="e.g. ML-KEM KeyGen"
            autoComplete="off"
            className={inputCls}
            onChange={(e) => {
              const v = e.target.value;
              // Picking from the datalist sets the full name in one change event.
              if (algorithmNames.includes(v)) addAlg(v);
              else setAlgDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addAlg(algDraft);
            }}
          />
          <datalist id="alg-options">
            {algorithmNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        {filters.alg.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {filters.alg.map((a) => (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, alg: filters.alg.filter((x) => x !== a) })}
                  className="rounded-full border border-line bg-surface-2 px-2 py-[1px] text-[11px] hover:border-accent"
                  aria-label={`Remove ${a}`}
                >
                  {a} ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className={legendCls}>Testing lab</span>
        <input type="search" list="lab-options" value={filters.lab} onChange={(e) => onChange({ ...filters, lab: e.target.value })} placeholder="Any lab" autoComplete="off" className={inputCls} />
        <datalist id="lab-options">
          {labs.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

      {FACETS.map(({ key, title }) => {
        const opts = facets[key];
        if (!opts || opts.length < 2) return null;
        const shown = key === "family" ? [...opts].sort((a, b) => Number(PQC_FAMILIES.has(b.option)) - Number(PQC_FAMILIES.has(a.option))) : opts;
        return (
          <details key={key} open={OPEN_BY_DEFAULT.has(key) || filters[key].length > 0} className="group">
            <summary className={`${legendCls} flex cursor-pointer list-none items-center gap-1 select-none`}>
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
                ▸
              </span>
              {title}
              {key === "family" && <span className="ml-1 normal-case tracking-normal text-ink-3">(all of)</span>}
              {filters[key].length > 0 && <span className="ml-auto normal-case tracking-normal text-accent">{filters[key].length} selected</span>}
            </summary>
            <div className="mt-1 flex flex-col gap-0.5">
              {shown.map((o) => (
                <label key={o.option} className={`flex items-center justify-between gap-2 text-sm ${o.count === 0 && !filters[key].includes(o.option) ? "text-ink-3" : ""}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={filters[key].includes(o.option)} onChange={() => toggle(key, o.option)} />
                    <span className="truncate">{key === "level" ? `Level ${o.option}` : key === "standard" ? `FIPS ${o.option}` : o.option}</span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">{o.count}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </aside>
  );
}
