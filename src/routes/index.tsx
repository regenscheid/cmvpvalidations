import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bars } from "../components/Bars";
import { Card, Eyebrow, Gate, H1, Section, StatusTag } from "../components/ui";
import { PQC_FAMILIES } from "../lib/pqc";
import { useModules } from "../data/load";
import type { ModuleRow } from "../data/types";
import { iso } from "../lib/dates";

export const Route = createFileRoute("/")({ component: SummaryRoute });

function SummaryRoute() {
  const state = useModules();
  return <Gate state={state} what="certificates">{(rows) => <Summary rows={rows} />}</Gate>;
}

function count<T extends string>(xs: T[]): Array<[T, number]> {
  const m = new Map<T, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Summary({ rows }: { rows: ModuleRow[] }) {
  const active = useMemo(() => rows.filter((r) => r.status === "Active"), [rows]);
  const s = useMemo(() => {
    const byStatus = count(rows.map((r) => r.status));
    const levels = count(active.map((r) => r.level)).sort((a, b) => a[0].localeCompare(b[0]));
    const types = count(active.map((r) => r.type));
    const labs = count(active.flatMap((r) => r.labs)).slice(0, 12);
    const fams = count(active.flatMap((r) => r.families));
    const pqc = fams.filter(([f]) => PQC_FAMILIES.has(f));
    const years = count(rows.map((r) => iso(r.first).slice(0, 4)).filter(Boolean)).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = [...rows].sort((a, b) => iso(b.last).localeCompare(iso(a.last))).slice(0, 10);
    const anyPqc = active.filter((r) => r.pqc.length).length;
    return { byStatus, levels, types, labs, fams, pqc, years, recent, anyPqc };
  }, [rows, active]);

  const A = { status: "Active" };
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Eyebrow>Summary · FIPS {[...new Set(rows.map((r) => r.standard))].join(", ")}</Eyebrow>
        <H1>CMVP validated modules</H1>
        <p className="max-w-prose text-[13px] text-ink-2">
          Every certificate's approved algorithms are linked to the CAVP validations they cite, down to tested capabilities and operating environments.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Certificates", rows.length, {}],
          ["Active", active.length, A],
          ["Active with PQC", s.anyPqc, { status: "Active", pqc: true }],
          ["Historical / revoked", rows.length - active.length, { status: "Historical|Revoked" }],
        ].map(([label, n, search]) => (
          <Link key={label as string} to="/modules" search={search as object} className="hover:no-underline">
            <Card className="p-4 hover:border-accent">
              <div className="text-[28px] font-semibold leading-none text-ink">{(n as number).toLocaleString()}</div>
              <div className="mt-1 text-[12px] text-ink-3">{label as string}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Post-quantum algorithms · active certificates">
          <Card className="p-4">
            {s.pqc.length ? (
              <Bars tone="pqc" items={s.pqc.map(([f, n]) => ({ label: f, count: n, search: { status: "Active", family: f } }))} />
            ) : (
              <p className="text-ink-3">None yet.</p>
            )}
          </Card>
        </Section>
        <Section title="Certificate status">
          <Card className="p-4">
            <Bars items={s.byStatus.map(([k, n]) => ({ label: k, count: n, search: { status: k } }))} />
          </Card>
        </Section>
        <Section title="Algorithm families · active certificates">
          <Card className="p-4">
            <Bars
              items={s.fams.map(([f, n]) => ({ label: f, count: n, search: { status: "Active", family: f }, tone: PQC_FAMILIES.has(f) ? "pqc" : "accent" }))}
            />
          </Card>
        </Section>
        <div className="space-y-6">
          <Section title="Overall level · active">
            <Card className="p-4">
              <Bars items={s.levels.map(([k, n]) => ({ label: `Level ${k}`, count: n, search: { status: "Active", level: k } }))} />
            </Card>
          </Section>
          <Section title="Module type · active">
            <Card className="p-4">
              <Bars items={s.types.map(([k, n]) => ({ label: k, count: n, search: { status: "Active", type: k } }))} />
            </Card>
          </Section>
          <Section title="First validated, by year · all">
            <Card className="p-4">
              <Bars items={s.years.map(([k, n]) => ({ label: k, count: n, search: {} }))} />
            </Card>
          </Section>
        </div>
        <Section title="Testing labs · active">
          <Card className="p-4">
            <Bars items={s.labs.map(([k, n]) => ({ label: k, count: n, search: { status: "Active", lab: k } }))} />
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
