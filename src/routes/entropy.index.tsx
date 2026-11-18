import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, Eyebrow, Gate, H1, Tag } from "../components/ui";
import { useEsvs } from "../data/load";
import type { EsvRow } from "../data/types";
import { iso } from "../lib/dates";

type EntropySearch = { q?: string; noise?: string; linked?: boolean };

export const Route = createFileRoute("/entropy/")({
  validateSearch: (raw: Record<string, unknown>): EntropySearch => {
    const out: EntropySearch = {};
    if (typeof raw.q === "string" && raw.q) out.q = raw.q;
    if (typeof raw.noise === "string" && raw.noise) out.noise = raw.noise;
    if (raw.linked === true || raw.linked === "true") out.linked = true;
    return out;
  },
  component: EntropyRoute,
});

function EntropyRoute() {
  const state = useEsvs();
  return <Gate state={state} what="entropy certificates">{(rows) => <Entropy rows={rows} />}</Gate>;
}

function Entropy({ rows }: { rows: EsvRow[] }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const set = (patch: EntropySearch) =>
    navigate({
      search: (prev) => {
        const next: EntropySearch = { ...prev, ...patch };
        if (!next.q) delete next.q;
        if (!next.noise) delete next.noise;
        if (!next.linked) delete next.linked;
        return next;
      },
      replace: true,
    });
  const noises = useMemo(() => [...new Set(rows.map((r) => r.noise_source).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => {
    const terms = (search.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (search.noise && r.noise_source !== search.noise) return false;
      if (search.linked && r.modules.length === 0) return false;
      const h = `${r.cert} ${r.vendor} ${r.implementation} ${r.description} ${r.conditioning.join(" ")}`.toLowerCase();
      return terms.every((t) => h.includes(t));
    });
  }, [rows, search]);
  const linked = rows.filter((r) => r.modules.length).length;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Eyebrow>Browse · entropy source validations (ESV)</Eyebrow>
        <H1 aside={`${shown.length.toLocaleString()} of ${rows.length.toLocaleString()}`}>Entropy sources</H1>
        <p className="max-w-prose text-[13px] text-ink-2">
          SP 800-90B entropy source certificates. Module certificates do not cite them, so links to modules are inferred: a module and an entropy source
          from the same vendor that cite the same CAVP validation (the source's vetted conditioning component). {linked.toLocaleString()} entropy sources link to at least one
          module.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <input
            type="search"
            value={search.q ?? ""}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="E-number, vendor, implementation, CAVP cert…"
            className="w-full max-w-sm rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <div role="radiogroup" aria-label="Noise source" className="inline-flex rounded-md border border-line bg-surface p-0.5 text-[13px]">
            {["", ...noises].map((n) => (
              <button
                key={n || "any"}
                type="button"
                role="radio"
                aria-checked={(search.noise ?? "") === n}
                onClick={() => set({ noise: n })}
                className={`rounded px-3 py-1 ${(search.noise ?? "") === n ? "bg-accent-bg font-medium text-accent" : "text-ink-2 hover:bg-surface-2"}`}
              >
                {n || "Any noise source"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!search.linked} onChange={(e) => set({ linked: e.currentTarget.checked })} />
            Linked to a module
          </label>
        </div>
      </header>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-[13px]">
          <thead className="bg-surface-2">
            <tr>
              {["Cert", "Vendor", "Implementation", "Noise source", "Reuse", "Conditioning", "Modules", "Last validated"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.esv} className="hover:bg-surface-2">
                <td className="border-b border-line-2 px-3 py-2">
                  <Link to="/entropy/$id" params={{ id: String(r.esv) }} className="mono">
                    {r.cert}
                  </Link>
                </td>
                <td className="border-b border-line-2 px-3 py-2">{r.vendor}</td>
                <td className="border-b border-line-2 px-3 py-2">
                  <div>{r.implementation}</div>
                  {r.description && <div className="text-[12px] text-ink-3">{r.description}</div>}
                </td>
                <td className="whitespace-nowrap border-b border-line-2 px-3 py-2">
                  <Tag tone={r.noise_source === "Physical" ? "accent" : "default"}>{r.noise_source || "—"}</Tag>
                </td>
                <td className="border-b border-line-2 px-3 py-2 text-[12px] text-ink-2">{r.reuse}</td>
                <td className="mono border-b border-line-2 px-3 py-2 text-[12px] text-ink-2">{r.conditioning.join(", ") || "—"}</td>
                <td className="mono whitespace-nowrap border-b border-line-2 px-3 py-2 text-[12px]">
                  {r.modules.length ? (
                    r.modules.length
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="mono whitespace-nowrap border-b border-line-2 px-3 py-2 text-ink-2">{iso(r.last) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
