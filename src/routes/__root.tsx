import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { useMeta } from "../data/load";

export const Route = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

const TABS = [
  { to: "/", label: "Summary", exact: true },
  { to: "/modules", label: "Modules", exact: false },
  { to: "/algorithms", label: "Algorithms", exact: false },
  { to: "/about", label: "About", exact: false },
] as const;

function RootLayout() {
  const meta = useMeta();
  const m = meta.kind === "ready" ? meta.data : null;
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2 text-ink hover:no-underline">
            <span className="text-[17px] font-semibold tracking-[-0.01em]">CMVP</span>
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-3">/ Certificates</span>
          </Link>
          <nav aria-label="Sections" className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-0.5 text-sm">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: t.exact, includeSearch: false }}
                className="rounded px-3 py-1 text-ink-2 hover:text-ink hover:no-underline"
                activeProps={{ className: "bg-surface !text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <dl className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px]">
            {[
              ["Snapshot", m?.snapshot ?? "—"],
              ["Certificates", m ? m.certificates.toLocaleString() : "—"],
              ["CAVP records", m ? m.cavp_validations.toLocaleString() : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-1.5">
                <dt className="uppercase tracking-[0.05em] text-ink-3">{k}</dt>
                <dd className="m-0 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-screen-2xl px-4 pb-10 text-[12px] text-ink-3">
        Compiled from public NIST CSRC CMVP and CAVP pages. Not an official NIST product; verify against the{" "}
        <a href="https://csrc.nist.gov/projects/cryptographic-module-validation-program/validated-modules" target="_blank" rel="noopener noreferrer">
          NIST certificate
        </a>{" "}
        before relying on any entry.
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-ink-2">
        That page doesn't exist. <Link to="/modules">Browse modules</Link>.
      </p>
    </div>
  );
}
