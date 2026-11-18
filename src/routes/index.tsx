import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bars } from "../components/Bars";
import { Card, Eyebrow, Gate, H1, Section, StatusTag } from "../components/ui";
import { PQC_FAMILIES } from "../lib/pqc";
import { useModules } from "../data/load";
import type { ModulesSearch } from "../data/filters";
import type { ModuleRow } from "../data/types";
import { iso } from "../lib/dates";

type SummarySearch = { standard?: string };

/** FIPS 140-3 is the current standard, so the summary opens on it; "all" combines every standard. */
const DEFAULT_STANDARD = "140-3";

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>): SummarySearch =>
    typeof raw.standard === "string" && raw.standard ? { standard: raw.standard } : {},
  component: SummaryRoute,
});

function SummaryRoute() {
  const state = useModules();
  return <Gate state={state} what="certificates">{(rows) => <Summary rows={rows} />}</Gate>;
}

function count<T extends string>(xs: T[]): Array<[T, number]> {
  const m = new Map<T, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function StandardSwitch({ standards, value }: { standards: string[]; value: string }) {
  const opts: Array<[string, string]> = [...standards.map((s): [string, string] => [s, `FIPS ${s}`]), ["all", "All"]];
  return (
    <div role="radiogroup" aria-label="Standard" className="inline-flex rounded-md border border-line bg-surface p-0.5 text-[13px]">
      {opts.map(([v, label]) => (
        <Link
          key={v}
          to="/"
          search={v === DEFAULT_STANDARD ? {} : { standard: v }}
          role="radio"
          aria-checked={value === v}
          className={`rounded px-3 py-1 hover:no-underline ${value === v ? "bg-accent-bg font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function Summary({ rows: allRows }: { rows: ModuleRow[] }) {
  const search = Route.useSearch();
  const standards = useMemo(() => [...new Set(allRows.map((r) => r.standard))].sort().reverse(), [allRows]);
  const wanted = search.standard ?? DEFAULT_STANDARD;
  const standard = wanted === "all" || standards.includes(wanted) ? wanted : (standards[0] ?? "all");
  const rows = useMemo(() => (standard === "all" ? allRows : allRows.filter((r) => r.standard === standard)), [allRows, standard]);
  const active = useMemo(() => rows.filter((r) => r.status === "Active"), [rows]);
  // FIPS 140-1 and 140-2 have no active certificates left: describe all of theirs instead.
  const scoped = active.length ? active : rows;
  const scope = active.length ? "active" : "all";

  /** Every link carries the chosen standard (and the active scope where the chart uses it). */
  const to = (extra: ModulesSearch, useScope = true): ModulesSearch => ({
    ...(standard === "all" ? {} : { standard }),
    ...(useScope && active.length ? { status: "Active" } : {}),
    ...extra,
  });

  const s = useMemo(() => {
    const byStatus = count(rows.map((r) => r.status));
    const levels = count(scoped.map((r) => r.level)).sort((a, b) => a[0].localeCompare(b[0]));
    const types = count(scoped.map((r) => r.type));
    const labs = count(scoped.flatMap((r) => r.labs)).slice(0, 12);
    const fams = count(scoped.flatMap((r) => r.families));
    const pqc = fams.filter(([f]) => PQC_FAMILIES.has(f));
    const years = count(rows.map((r) => iso(r.first).slice(0, 4)).filter(Boolean)).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = [...rows].sort((a, b) => iso(b.last).localeCompare(iso(a.last))).slice(0, 10);
    const anyPqc = active.filter((r) => r.pqc.length).length;
    return { byStatus, levels, types, labs, fams, pqc, years, recent, anyPqc };
  }, [rows, active, scoped]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Eyebrow>Summary · {standard === "all" ? `FIPS ${standards.join(", ")}` : `FIPS ${standard}`}</Eyebrow>
          <H1>CMVP validated modules</H1>
          <p className="max-w-prose text-[13px] text-ink-2">
            Every certificate's approved algorithms are linked to the CAVP validations they cite, down to tested capabilities and operating environments.
          </p>
        </div>
        {standards.length > 1 && <StandardSwitch standards={standards} value={standard} />}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Certificates", rows.length, to({}, false)],
          ["Active", active.length, to({ status: "Active" }, false)],
          ["Active with PQC", s.anyPqc, to({ status: "Active", pqc: true }, false)],
          ["Historical / revoked", rows.length - active.length, to({ status: "Historical|Revoked" }, false)],
        ].map(([label, n, search]) => (
          <Link key={label as string} to="/modules" search={search as ModulesSearch} className="hover:no-underline">
            <Card className="p-4 hover:border-accent">
              <div className="text-[28px] font-semibold leading-none text-ink">{(n as number).toLocaleString()}</div>
              <div className="mt-1 text-[12px] text-ink-3">{label as string}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={`Post-quantum algorithms · ${scope} certificates`}>
          <Card className="p-4">
            {s.pqc.length ? (
              <Bars tone="pqc" items={s.pqc.map(([f, n]) => ({ label: f, count: n, search: to({ family: f }) }))} />
            ) : (
              <p className="text-ink-3">None.</p>
            )}
          </Card>
        </Section>
        <Section title="Certificate status">
          <Card className="p-4">
            <Bars items={s.byStatus.map(([k, n]) => ({ label: k, count: n, search: to({ status: k }, false) }))} />
          </Card>
        </Section>
        <Section title={`Algorithm families · ${scope} certificates`}>
          <Card className="p-4">
            <Bars
              items={s.fams.map(([f, n]) => ({ label: f, count: n, search: to({ family: f }), tone: PQC_FAMILIES.has(f) ? "pqc" : "accent" }))}
            />
          </Card>
        </Section>
        <div className="space-y-6">
          <Section title={`Overall level · ${scope}`}>
            <Card className="p-4">
              <Bars items={s.levels.map(([k, n]) => ({ label: `Level ${k}`, count: n, search: to({ level: k }) }))} />
            </Card>
          </Section>
          <Section title={`Module type · ${scope}`}>
            <Card className="p-4">
              <Bars items={s.types.map(([k, n]) => ({ label: k, count: n, search: to({ type: k }) }))} />
            </Card>
          </Section>
          <Section title="First validated, by year · all">
            <Card className="p-4">
              <Bars items={s.years.map(([k, n]) => ({ label: k, count: n, search: to({ year: k }, false) }))} />
            </Card>
          </Section>
        </div>
        <Section title={`Testing labs · ${scope}`}>
          <Card className="p-4">
            <Bars items={s.labs.map(([k, n]) => ({ label: k, count: n, search: to({ lab: k }) }))} />
          </Card>
        </Section>
        <Section title="Recently updated">
          <Card>
            <ul className="m-0 list-none p-0 text-[13px]">
              {s.recent.map((r) => (
                <li key={r.cert} className="flex items-baseline gap-3 border-b border-line-2 px-4 py-2 last:border-0">
                  <span className="mono w-24 shrink-0 text-ink-3">{iso(r.last)}</span>
                  <Link to="/modules/$cert" params={{ cert: String(r.cert) }} className="mono shrink-0">
                    #{r.cert}
                  </Link>
                  <span className="min-w-0 flex-1 truncate" title={`${r.vendor} — ${r.module}`}>
                    {r.module}
                  </span>
                  <StatusTag status={r.status} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </div>
    </div>
  );
}
