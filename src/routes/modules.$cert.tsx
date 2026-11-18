import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ApprovedAlgorithms, CitedValidations } from "../components/ApprovedAlgorithms";
import { Card, Ext, Eyebrow, FamilyTag, Gate, H1, KV, Section, StatusTag } from "../components/ui";
import { useCavps, useCert } from "../data/load";
import type { CertRecord } from "../data/types";

export const Route = createFileRoute("/modules/$cert")({ component: CertRoute });

function CertRoute() {
  const { cert } = Route.useParams();
  const state = useCert(cert);
  return (
    <Gate state={state} what={`certificate ${cert}`}>
      {(r) => <CertView r={r} />}
    </Gate>
  );
}

function familyOf(name: string): string {
  const m = /^(ML-DSA|ML-KEM|SLH-DSA|LMS|XMSS)\b/.exec(name);
  return m ? m[1]! : "";
}

function CertView({ r }: { r: CertRecord }) {
  const cavpIds = useMemo(() => [...new Set(r.approved.map((e) => e.cavp_id).filter(Boolean))], [r.approved]);
  const cavps = useCavps(cavpIds);
  const pqc = [...new Set(r.approved.map((e) => familyOf(e.algorithm)).filter(Boolean))];
  const versions = [
    ["Software versions", r.software_versions],
    ["Hardware versions", r.hardware_versions],
    ["Firmware versions", r.firmware_versions],
  ] as Array<[string, string]>;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>
          <Link to="/modules">Modules</Link> · Certificate #{r.cert} · FIPS {r.standard}
        </Eyebrow>
        <H1>{r.module || "(module name not shown on CSRC)"}</H1>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <StatusTag status={r.status} />
          <span>{r.vendor}</span>
          <span className="text-ink-3">·</span>
          <span>
            {r.type}, level {r.level}
          </span>
          {pqc.map((f) => (
            <FamilyTag key={f} family={f} />
          ))}
          <span className="ml-auto flex gap-3 text-[13px]">
            <Ext href={r.url}>CSRC certificate</Ext>
            {r.security_policy && <Ext href={r.security_policy}>Security policy</Ext>}
          </span>
        </div>
        {r.sparse && (
          <p className="rounded-md border border-line bg-hist-bg px-3 py-2 text-[13px] text-hist">
            The CSRC page for this certificate shows only part of its details; vendor and module come from the CMVP search list.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Details">
            <Card>
              <KV
                rows={[
                  ["Description", r.description],
                  ["Caveat", r.caveat],
                  ["Embodiment", r.embodiment],
                  ["Overall level", r.level],
                  ["Level exceptions", r.level_exceptions.length ? r.level_exceptions.join("; ") : ""],
                  ["Sunset date", r.sunset],
                  ...versions,
                  ["Entropy", r.entropy],
                  ["PIV cert", r.piv_cert],
                  ["Product URL", r.product_url ? <Ext href={r.product_url}>{r.product_url}</Ext> : ""],
                  ...Object.entries(r.other_fields).map(([k, v]) => [k, Array.isArray(v) ? v.join("; ") : v] as [string, string]),
                ]}
              />
            </Card>
          </Section>

          <Section
            title={`Approved algorithms · ${new Set(r.approved.map((e) => e.algorithm)).size} across ${cavpIds.length} CAVP validation${cavpIds.length === 1 ? "" : "s"}`}
          >
            <ApprovedAlgorithms approved={r.approved} cavps={cavps} standard={r.standard} />
          </Section>

          {(r.allowed_algorithms || r.non_approved_algorithms) && (
            <Section title="Other algorithms">
              <Card>
                <KV
                  rows={[
                    ["Allowed", r.allowed_algorithms],
                    ["Non-approved", r.non_approved_algorithms],
                  ]}
                />
              </Card>
            </Section>
          )}

          {r.tested_configurations.length > 0 && (
            <Section title={`Tested configurations · ${r.tested_configurations.length}`}>
              <Card className="p-4">
                <ul className="m-0 list-disc space-y-0.5 pl-5 text-[13px]">
                  {r.tested_configurations.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Card>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <Section title="Vendor">
            <Card className="space-y-2 p-4 text-[13px]">
              <div className="font-medium">{r.vendor_info.website ? <Ext href={r.vendor_info.website}>{r.vendor}</Ext> : r.vendor}</div>
              {r.vendor_info.address.length > 0 && <div className="text-ink-2">{r.vendor_info.address.join(", ")}</div>}
              {r.vendor_info.contacts.map((c, i) => (
                <div key={i} className="text-ink-2">
                  {c.name}
                  {c.phone && <span className="text-ink-3"> · {c.phone}</span>}
                </div>
              ))}
            </Card>
          </Section>
          {cavpIds.length > 0 && (
            <Section title="Cited CAVP validations">
              <Card>
                <CitedValidations approved={r.approved} cavps={cavps} />
              </Card>
            </Section>
          )}
          <Section title="Validation history">
            <Card>
              <table className="w-full text-[13px]">
                <tbody>
                  {r.history.map((h, i) => (
                    <tr key={i} className="border-b border-line-2 last:border-0">
                      <td className="mono whitespace-nowrap px-3 py-1.5 align-top text-ink-2">{h.date}</td>
                      <td className="px-3 py-1.5 align-top">
                        {h.type}
                        <div className="text-[12px] text-ink-3">{h.lab}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>
          {r.files.length > 0 && (
            <Section title="Related files">
              <Card className="space-y-1 p-4 text-[13px]">
                {r.files.map((f) => (
                  <div key={f.url}>
                    <Ext href={f.url}>{f.label}</Ext>
                  </div>
                ))}
              </Card>
            </Section>
          )}
          <p className="text-[12px] text-ink-3">Record fetched {r.fetched}.</p>
        </aside>
      </div>
    </article>
  );
}
