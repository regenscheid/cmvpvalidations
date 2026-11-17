import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Capabilities } from "../components/Capabilities";
import { Card, Ext, Eyebrow, Gate, H1, KV, Section, StatusTag } from "../components/ui";
import { useCavp, useModules } from "../data/load";
import type { CavpRecord } from "../data/types";

export const Route = createFileRoute("/cavp/$id")({ component: CavpRoute });

function CavpRoute() {
  const { id } = Route.useParams();
  const state = useCavp(id);
  return (
    <Gate state={state} what={`CAVP validation ${id}`}>
      {(v) => <CavpView v={v} />}
    </Gate>
  );
}

function CavpView({ v }: { v: CavpRecord }) {
  const modules = useModules();
  const [oe, setOe] = useState(-1);
  const byAlg = useMemo(() => {
    const m = new Map<string, CavpRecord["algorithms"]>();
    for (const a of v.algorithms) if (oe < 0 || a.oe === oe) m.set(a.algorithm, [...(m.get(a.algorithm) ?? []), a]);
    return [...m.entries()];
  }, [v.algorithms, oe]);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>CAVP validation · {v.cavp_cert}</Eyebrow>
        <H1 aside={v.cavp_cert}>{v.implementation}</H1>
        <p className="flex flex-wrap gap-3 text-[13px] text-ink-2">
          <span>{v.vendor}</span>
          <span className="ml-auto">
            <Ext href={v.url}>CSRC validation</Ext>
          </span>
        </p>
        {v.partial && (
          <p className="rounded-md border border-line bg-hist-bg px-3 py-2 text-[13px] text-hist">
            CSRC times out rendering this validation in full, so it was assembled row by row. Capabilities are complete; operating-environment details
            (processor, OS) are not.
          </p>
        )}
      </header>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Details">
            <Card>
              <KV
                rows={[
                  ["Description", v.description],
                  ["Version", v.version],
                  ["Type", v.type],
                  ["First validated", v.first_validated],
                  ["Vendor site", v.vendor_website ? <Ext href={v.vendor_website}>{v.vendor_website}</Ext> : ""],
                ]}
              />
            </Card>
          </Section>
          <Section
            title={`Algorithms · ${new Set(v.algorithms.map((a) => a.algorithm)).size}`}
            aside={
              v.oes.length > 1 && (
                <select
                  value={oe}
                  onChange={(e) => setOe(Number(e.currentTarget.selectedOptions.item(0)?.getAttribute("value") ?? -1))}
                  className="max-w-[60%] rounded-md border border-line bg-surface px-2 py-1 text-[12px]"
                  aria-label="Operating environment"
                >
                  <option value={-1}>All {v.oes.length} operating environments</option>
                  {v.oes.map((o, i) => (
                    <option key={i} value={i}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )
            }
          >
            <div className="space-y-1.5">
              {byAlg.map(([name, rows]) => (
                <details key={name} className="rounded-md border border-line bg-surface">
                  <summary className="cursor-pointer px-4 py-2 text-[13px]">
                    <span className="font-medium">{name}</span>{" "}
                    <span className="text-[12px] text-ink-3">{rows.length > 1
                        ? `${rows.length} capability sets`
                        : (rows[0]?.capabilities.find((l) => /:\s*\S/.test(l)) ?? "").trim()}</span>
                  </summary>
                  <div className="space-y-3 border-t border-line-2 px-4 py-3">
                    {rows.map((r, i) => (
                      <div key={i} className="space-y-1">
                        {v.oes.length > 1 && <div className="text-[11px] text-ink-3">OE: {v.oes[r.oe]?.name}</div>}
                        <Capabilities lines={r.capabilities} />
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Section>
        </div>
        <aside className="space-y-6">
          <Section title="Cited by CMVP certificates">
            <Gate state={modules} what="certificates">
              {(rows) => {
                const users = rows.filter((r) => r.cavp.includes(v.cavp_id));
                return users.length === 0 ? (
                  <p className="text-[13px] text-ink-3">No crawled certificate cites this validation.</p>
                ) : (
                  <Card>
                    <ul className="m-0 list-none p-0 text-[13px]">
                      {users.map((u) => (
                        <li key={u.cert} className="border-b border-line-2 px-3 py-2 last:border-0">
                          <Link to="/modules/$cert" params={{ cert: String(u.cert) }} className="mono">
                            #{u.cert}
                          </Link>{" "}
                          <StatusTag status={u.status} />
                          <div className="text-ink-2">{u.module}</div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              }}
            </Gate>
          </Section>
          <Section title={`Operating environments · ${v.oes.length}`}>
            <Card className="space-y-3 p-4 text-[13px]">
              {v.oes.map((o, i) => (
                <div key={i}>
                  <div className="font-medium">{o.name}</div>
                  {o.details.length > 0 && <Capabilities lines={o.details} />}
                </div>
              ))}
            </Card>
          </Section>
          <p className="text-[12px] text-ink-3">Record fetched {v.fetched}.</p>
        </aside>
      </div>
    </article>
  );
}
