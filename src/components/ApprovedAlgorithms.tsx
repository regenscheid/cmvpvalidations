/**
 * A certificate's approved algorithms, always visible: grouped by family, each row showing the
 * CAVP certificate(s) it cites and a digest of what was tested. Rows expand to the full
 * capabilities per CAVP validation and operating environment.
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { Loaded } from "../data/load";
import type { ApprovedEntry, CavpRecord } from "../data/types";
import { matchAlgorithm, rowNames } from "../lib/algName";
import { summarizeCaps } from "../lib/capSummary";
import { FAMILY_ORDER, familyOf } from "../lib/family";
import { Capabilities } from "./Capabilities";
import { Card, FamilyTag, Tag } from "./ui";

type Ref = { cavp_cert: string; cavp_id: string; from_note?: boolean; inferred?: string; cited_as?: string };
type Item = { name: string; family: string; refs: Ref[]; notes: string[] };
type Cavps = Record<string, Loaded<CavpRecord>>;

const cavpOf = (cavps: Cavps, id: string) => cavps[`cavp/${id}.json`];

export function ApprovedAlgorithms({ approved, cavps, standard }: { approved: ApprovedEntry[]; cavps: Cavps; standard: string }) {
  const broadNames = standard !== "140-3";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const items = useMemo(() => {
    const m = new Map<string, Item>();
    for (const e of approved) {
      const it = m.get(e.algorithm) ?? { name: e.algorithm, family: familyOf(e.algorithm), refs: [], notes: [] };
      if (!it.refs.some((r) => r.cavp_cert === e.cavp_cert))
        it.refs.push({
          cavp_cert: e.cavp_cert,
          cavp_id: e.cavp_id,
          from_note: !!e.from_note,
          ...(e.inferred ? { inferred: e.inferred, cited_as: e.cited_as ?? "" } : {}),
        });
      // A row's own text, when the certificate gives no CAVP link for it.
      if (e.note && (e.from_note || !e.cavp_ref) && !it.notes.includes(e.note)) it.notes.push(e.note);
      m.set(e.algorithm, it);
    }
    return [...m.values()];
  }, [approved]);
  const families = useMemo(() => {
    const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
    const g = new Map<string, Item[]>();
    for (const i of shown) g.set(i.family, [...(g.get(i.family) ?? []), i]);
    return [...g.entries()].sort((a, b) => FAMILY_ORDER.indexOf(a[0]) - FAMILY_ORDER.indexOf(b[0]));
  }, [items, q]);

  if (items.length === 0) return <p className="text-ink-3">No approved algorithms are listed on this certificate.</p>;
  const allOpen = open.size > 0 && families.every(([, xs]) => xs.every((x) => open.has(x.name)));
  const toggle = (n: string) =>
    setOpen((s) => {
      const t = new Set(s);
      if (t.has(n)) t.delete(n);
      else t.add(n);
      return t;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {items.length > 12 && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter algorithms"
            className="w-full max-w-xs rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
        )}
        <button
          type="button"
          className="text-[12px] text-ink-2 underline-offset-2 hover:underline"
          onClick={() => setOpen(allOpen ? new Set() : new Set(families.flatMap(([, xs]) => xs.map((x) => x.name))))}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {families.map(([fam, xs]) => (
        <Card key={fam}>
          <div className="flex items-center gap-2 border-b border-line-2 px-4 py-2">
            <FamilyTag family={fam} />
            <span className="text-[12px] text-ink-3">{xs.length}</span>
          </div>
          <ul className="m-0 list-none p-0">
            {xs.map((it) => (
              <AlgRow key={it.name} item={it} cavps={cavps} broadNames={broadNames} isOpen={open.has(it.name)} onToggle={() => toggle(it.name)} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function AlgRow({
  item,
  cavps,
  broadNames,
  isOpen,
  onToggle,
}: {
  item: Item;
  cavps: Cavps;
  broadNames: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const resolved = item.refs.map((r) => {
    const st = r.cavp_id ? cavpOf(cavps, r.cavp_id) : undefined;
    const v = st?.kind === "ready" ? st.data : null;
    // A validation named in the row's note is one the algorithm builds on (KTS on AES and HMAC), not where
    // the algorithm itself was tested, so its capabilities are not matched against the row.
    const m =
      v && !r.from_note
        ? matchAlgorithm(v.algorithms, item.name, r.cavp_cert, broadNames)
        : { hits: [], approx: false, how: "none" as const };
    return { ref: r, st, v, ...m };
  });
  const loading = resolved.some((x) => x.ref.cavp_id && (!x.st || x.st.kind === "loading"));
  const hits = resolved.flatMap((x) => x.hits);
  // FIPS 140-2 names ("AES", "SHS") cover several CAVP algorithms: say which, then the parameters.
  const broad = resolved.some((x) => x.how === "family" || x.how === "all");
  const names = broad ? rowNames(hits.map((h) => h.algorithm)) : "";
  const caps = summarizeCaps(hits.map((h) => h.capabilities), names ? 2 : 3);
  const note = item.notes.join(" · ");
  const summary = [names, caps].filter(Boolean).join(" · ") || note;
  const tested = resolved.filter((x) => !x.ref.from_note);
  const notFound = !loading && tested.length > 0 && tested.every((x) => x.v && x.hits.length === 0);
  const noValidation = !item.refs.some((r) => r.cavp_id);
  const approxAs = resolved.find((x) => x.approx && x.hits[0])?.hits[0]?.algorithm;

  return (
    <li className="border-b border-line-2 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="grid w-full grid-cols-[1rem_1fr] items-baseline gap-x-2 gap-y-0.5 px-4 py-2 text-left hover:bg-surface-2 md:grid-cols-[1rem_minmax(11rem,17rem)_6rem_1fr]"
      >
        <span className={`text-ink-3 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
          ▸
        </span>
        <span className="font-medium">
          {item.name}
          {approxAs && (
            <span className="ml-2 align-middle">
              <Tag title="Spelled differently on the CAVP validation">as “{approxAs}”</Tag>
            </span>
          )}
        </span>
        <span className="col-start-2 flex flex-wrap gap-1 md:col-start-auto">
          {(item.refs.length > 6 && !isOpen ? item.refs.slice(0, 4) : item.refs).map((r) =>
            r.cavp_id ? (
              <Link
                key={r.cavp_cert}
                to="/cavp/$id"
                params={{ id: r.cavp_id }}
                onClick={(e) => e.stopPropagation()}
                className={`mono text-[12px] ${r.inferred ? "underline decoration-dotted underline-offset-2" : ""}`}
                title={r.inferred ? `Inferred: ${r.inferred}` : undefined}
              >
                {r.cavp_cert}
              </Link>
            ) : (
              <span key={r.cavp_cert} className="mono text-[12px] text-ink-3">
                {r.cavp_cert || "—"}
              </span>
            ),
          )}
          {item.refs.length > 6 && !isOpen && (
            <span className="text-[12px] text-ink-3" title="Expand the row to see every cited validation">
              +{item.refs.length - 4} more
            </span>
          )}
        </span>
        <span className="col-start-2 min-w-0 text-[12px] text-ink-2 md:col-start-auto md:truncate" title={summary}>
          {loading ? (
            <span className="text-ink-3">loading…</span>
          ) : notFound ? (
            <Tag tone="neg" title="The certificate cites this CAVP validation, but it does not list an algorithm by this name">
              not listed on the cited validation
            </Tag>
          ) : (
            summary || (
              <span className="text-ink-3">
                {hits.length ? "no parameters listed" : noValidation ? "no CAVP validation cited" : "validation not in this snapshot"}
              </span>
            )
          )}
        </span>
      </button>
      {isOpen && (
        <div className="space-y-4 bg-surface-2/50 px-4 pb-4 pt-1 md:pl-10">
          {item.notes.map((n) => (
            <p key={n} className="text-[12px] text-ink-2">
              <span className="text-ink-3">The certificate says:</span> {n}
            </p>
          ))}
          {resolved.filter(({ ref }) => ref.cavp_cert || ref.cavp_id).map(({ ref, st, v, hits: hs }) => (
            <div key={ref.cavp_cert} className="space-y-2">
              {ref.inferred && (
                <p className="text-[12px] text-ink-3">
                  <Tag title={`The certificate cites ${ref.cited_as}`}>inferred</Tag> {ref.inferred}.
                </p>
              )}
              <div className="text-[12px] text-ink-3">
                <span className="mono text-ink">{ref.cavp_cert}</span>
                {v && (
                  <>
                    {" "}
                    · {v.implementation}
                    {v.version && ` v${v.version}`}
                  </>
                )}
              </div>
              {!ref.cavp_id ? (
                <p className="text-[12px] text-ink-3">
                  {ref.from_note ? "Named in the certificate's text, but not found on CAVP." : "The certificate gives no CAVP link for this entry."}
                </p>
              ) : ref.from_note ? (
                <p className="text-[12px] text-ink-3">Named in the certificate's text for this algorithm; open the validation for its capabilities.</p>
              ) : st?.kind === "error" ? (
                <p className="text-[12px] text-ink-3">Validation {st.message}.</p>
              ) : !v ? (
                <p className="text-[12px] text-ink-3">Loading…</p>
              ) : hs.length === 0 ? (
                <p className="text-[12px] text-ink-3">Not listed on this validation under this name.</p>
              ) : (
                hs.map((h, i) => (
                  <div key={i} className="rounded border border-line-2 bg-surface px-3 py-2">
                    {(h.algorithm !== item.name || v.oes.length > 1) && (
                      <div className="mb-1 text-[11px] text-ink-3">
                        {h.algorithm !== item.name && <span className="font-medium text-ink-2">{h.algorithm}</span>}
                        {h.algorithm !== item.name && v.oes.length > 1 && " · "}
                        {v.oes.length > 1 && `OE: ${v.oes[h.oe]?.name}`}
                      </div>
                    )}
                    <Capabilities lines={h.capabilities} />
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/** Sidebar list of the CAVP validations a certificate cites. */
export function CitedValidations({ approved, cavps }: { approved: ApprovedEntry[]; cavps: Cavps }) {
  const refs = useMemo(() => {
    // Only actual CAVP certificates: "vendor affirmed" and free text are not validations.
    const m = new Map<string, { cavp_cert: string; cavp_id: string; algs: Set<string> }>();
    for (const e of approved) {
      if (!e.cavp_id && !e.cavp_ref) continue;
      const k = e.cavp_id || e.cavp_cert;
      const r = m.get(k) ?? { cavp_cert: e.cavp_cert, cavp_id: e.cavp_id, algs: new Set<string>() };
      r.algs.add(e.algorithm);
      m.set(k, r);
    }
    return [...m.values()].map((r) => ({ ...r, n: r.algs.size }));
  }, [approved]);
  if (!refs.length) return null;
  return (
    <ul className="m-0 list-none p-0 text-[13px]">
      {refs.map((r) => {
        const st = r.cavp_id ? cavpOf(cavps, r.cavp_id) : undefined;
        const v = st?.kind === "ready" ? st.data : null;
        return (
          <li key={r.cavp_id || r.cavp_cert} className="border-b border-line-2 px-3 py-2 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              {r.cavp_id ? (
                <Link to="/cavp/$id" params={{ id: r.cavp_id }} className="mono">
                  {r.cavp_cert}
                </Link>
              ) : (
                <span className="mono">{r.cavp_cert}</span>
              )}
              <span className="text-[12px] text-ink-3">
                {r.n} algorithm{r.n === 1 ? "" : "s"}
              </span>
            </div>
            {v && (
              <div className="text-[12px] text-ink-2">
                {v.implementation}
                {v.version && ` v${v.version}`}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
