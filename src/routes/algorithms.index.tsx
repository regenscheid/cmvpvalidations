import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, Eyebrow, FamilyTag, Gate, H1 } from "../components/ui";
import { PQC_FAMILIES } from "../lib/pqc";
import { useAlgorithms } from "../data/load";
import type { AlgorithmRow } from "../data/types";

export const Route = createFileRoute("/algorithms/")({ component: AlgorithmsRoute });

function AlgorithmsRoute() {
  const state = useAlgorithms();
  return <Gate state={state} what="algorithms">{(rows) => <Algorithms rows={rows} />}</Gate>;
}

function Algorithms({ rows }: { rows: AlgorithmRow[] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, AlgorithmRow[]>();
    for (const r of rows) if (!q || r.name.toLowerCase().includes(q.toLowerCase())) m.set(r.family, [...(m.get(r.family) ?? []), r]);
    return [...m.entries()].sort(
      (a, b) => Number(PQC_FAMILIES.has(b[0])) - Number(PQC_FAMILIES.has(a[0])) || a[0].localeCompare(b[0]),
    );
  }, [rows, q]);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Eyebrow>Browse · approved algorithms</Eyebrow>
        <H1 aside={`${rows.length} names`}>Algorithms</H1>
        <p className="max-w-prose text-[13px] text-ink-2">
          Every algorithm name that appears in a certificate's Approved Algorithms list. Counts are certificates (active / all); click one to list them.
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter algorithm names"
          className="mt-2 w-full max-w-sm rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
      </header>
      <div className="columns-1 gap-5 md:columns-2 2xl:columns-3">
        {groups.map(([fam, algs]) => (
          <Card key={fam} className="mb-5 break-inside-avoid">
            <div className="flex items-center justify-between border-b border-line-2 px-4 py-2">
              <FamilyTag family={fam} />
              <Link to="/modules" search={{ family: fam }} className="text-[12px]">
                all {fam} modules →
              </Link>
            </div>
            <table className="w-full text-[13px]">
              <tbody>
                {algs.map((a) => (
                  <tr key={a.name} className="border-b border-line-2 last:border-0">
                    <td className="px-4 py-1.5">
                      <Link to="/modules" search={{ alg: a.name }}>
                        {a.name}
                      </Link>
                    </td>
                    <td className="mono whitespace-nowrap px-4 py-1.5 text-right text-ink-2">
                      <Link to="/modules" search={{ alg: a.name, status: "Active" }} className="text-ink">
                        {a.active}
                      </Link>
                      <span className="text-ink-3"> / {a.modules}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </div>
  );
}
