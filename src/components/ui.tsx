import type { ReactNode } from "react";
import type { Loaded } from "../data/load";
import { PQC_FAMILIES } from "../lib/pqc";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">{children}</p>;
}

export function H1({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{children}</h1>
      {aside && <span className="font-mono text-[13px] text-ink-3">{aside}</span>}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-surface ${className}`}>{children}</div>;
}

const TAG: Record<string, string> = {
  default: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-bg text-accent border-transparent",
  pqc: "bg-pqc-bg text-pqc border-transparent",
  hist: "bg-hist-bg text-hist border-transparent",
  neg: "bg-neg-bg text-neg border-transparent",
};

export function Tag({ children, tone = "default", title }: { children: ReactNode; tone?: keyof typeof TAG; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] ${TAG[tone]}`}>
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const tone = status === "Active" ? "accent" : status === "Revoked" ? "neg" : "hist";
  return <Tag tone={tone}>{status || "—"}</Tag>;
}

export function FamilyTag({ family }: { family: string }) {
  return <Tag tone={PQC_FAMILIES.has(family) ? "pqc" : "default"}>{family}</Tag>;
}

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** Loading / error banner for a Loaded<T>; renders children only when ready. */
export function Gate<T>({ state, children, what }: { state: Loaded<T>; children: (data: T) => ReactNode; what: string }) {
  if (state.kind === "loading")
    return (
      <div role="status" className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
        Loading {what}…
      </div>
    );
  if (state.kind === "error")
    return (
      <div role="alert" className="rounded-md border border-neg/30 bg-neg-bg px-3 py-2 text-sm text-neg">
        Could not load {what}: {state.message}
      </div>
    );
  return <>{children(state.data)}</>;
}

export function KV({ rows }: { rows: Array<[string, ReactNode]> }) {
  const shown = rows.filter(([, v]) => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 sm:grid-cols-[max-content_1fr]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[12px] text-ink-3 sm:pt-[1px]">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
