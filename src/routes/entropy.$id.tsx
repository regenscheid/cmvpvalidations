import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, Ext, Eyebrow, Gate, H1, KV, Section, StatusTag, Tag } from "../components/ui";
import { useEsv } from "../data/load";
import type { EsvRecord } from "../data/types";

export const Route = createFileRoute("/entropy/$id")({ component: EsvRoute });

function EsvRoute() {
  const { id } = Route.useParams();
  const state = useEsv(id);
  return (
    <Gate state={state} what={`entropy certificate E${id}`}>
      {(e) => <EsvView e={e} />}
    </Gate>
  );
}

function EsvView({ e }: { e: EsvRecord }) {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Entropy source · {e.cert}</Eyebrow>
        <H1 aside={e.cert}>{e.implementation}</H1>
        <p className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
          <span>{e.vendor}</span>
          <Tag tone={e.noise_source === "Physical" ? "accent" : "default"}>{e.noise_source || "noise source not stated"}</Tag>
          <span className="ml-auto flex gap-4">
            {e.files.map((f) => (
              <Ext key={f.url} href={f.url}>
                {f.label}
              </Ext>
            ))}
            <Ext href={e.url}>CSRC certificate</Ext>
          </span>
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Details">
            <Card>
              <KV
                rows={[
                  ["Description", e.description],
                  ["Version", e.version],
                  ["Standard", e.standard],
                  ["Noise source", e.noise_source],
                  ["Reuse status", e.reuse],
                ]}
              />
            </Card>
          </Section>
          <Section title={`Operating environments · ${e.entries.reduce((n, x) => n + x.oes.length, 0)}`}>
            <div className="space-y-3">
              {e.entries.map((x, i) => (
                <Card key={i} className="p-4 text-[13px]">
                  <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-ink-2">
                    <span>
                      <span className="text-ink-3">Entropy per output:</span> {x.bits_per_output || "—"}
                    </span>
                    <span>
                      <span className="text-ink-3">Output size:</span> {x.output_bits ? `${x.output_bits} bits` : "—"}
                    </span>
                    <span>
                      <span className="text-ink-3">Conditioning:</span>{" "}
                      {x.conditioning.length
                        ? x.conditioning.map((c, j) => (
                            <span key={j}>
                              {j > 0 && ", "}
                              {c.cavp_id ? (
                                <Link to="/cavp/$id" params={{ id: c.cavp_id }} className="mono">
                                  {c.cavp_cert}
                                </Link>
                              ) : null}{" "}
                              {c.algorithm && <span className="text-ink-3">({c.algorithm})</span>}
                            </span>
                          ))
                        : "none"}
                    </span>
                  </div>
                  <ul className="m-0 list-disc space-y-0.5 pl-5 text-ink">
                    {x.oes.map((oe) => (
                      <li key={oe}>{oe}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </Section>
          <Section title={`Modules · inferred · ${e.modules.length}`}>
            <Card>
              <p className="border-b border-line-2 px-4 py-2 text-[12px] text-ink-3">
                Module certificates do not cite entropy certificates. These modules, from the same vendor, cite the same CAVP validation as this source's
                vetted conditioning component, which suggests they use it. The module's security policy is the authority.
              </p>
              {e.modules.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ink-3">No module in this snapshot cites one of its conditioning validations.</p>
              ) : (
                <ul className="m-0 list-none p-0 text-[13px]">
                  {e.modules.map((m) => (
                    <li key={m.cert} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-2 px-4 py-2 last:border-0">
                      <Link to="/modules/$cert" params={{ cert: String(m.cert) }} className="mono shrink-0">
                        #{m.cert}
                      </Link>
                      <span className="min-w-0 flex-1">
                        {m.module} <span className="text-ink-3">· {m.vendor}</span>
                      </span>
                      <span className="mono text-[12px] text-ink-3">via {m.via.map((v) => v.cavp_cert).join(", ")}</span>
                      <StatusTag status={m.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Vendor">
            <Card className="p-4 text-[13px]">
              <div className="font-medium">
                {e.vendor_info.website ? <Ext href={e.vendor_info.website}>{e.vendor_info.name}</Ext> : e.vendor_info.name}
              </div>
              {e.vendor_info.address.map((l) => (
                <div key={l} className="text-ink-2">
                  {l}
                </div>
              ))}
            </Card>
          </Section>
          <Section title="Validation history">
            <Card>
              <ul className="m-0 list-none p-0 text-[13px]">
                {e.history.map((h, i) => (
                  <li key={i} className="flex gap-3 border-b border-line-2 px-4 py-2 last:border-0">
                    <span className="mono w-24 shrink-0 text-ink-3">{h.date}</span>
                    <span>{h.lab}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </div>
      </div>
    </article>
  );
}
