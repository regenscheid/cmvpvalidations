import { Link } from "@tanstack/react-router";
import type { ModulesSearch } from "../data/filters";

/** Horizontal count bars; each row links to the modules table with a filter applied. */
export function Bars({
  items,
  tone = "accent",
}: {
  items: Array<{ label: string; count: number; search: ModulesSearch; tone?: "accent" | "pqc" }>;
  tone?: "accent" | "pqc";
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {items.map((i) => (
        <li key={i.label}>
          <Link to="/modules" search={i.search} className="group grid grid-cols-[minmax(7rem,12rem)_1fr_3rem] items-center gap-3 text-[13px] text-ink hover:no-underline">
            <span className="truncate group-hover:underline" title={i.label}>
              {i.label}
            </span>
            <span className="h-2.5 rounded-full bg-surface-2">
              <span
                className={`block h-2.5 rounded-full ${(i.tone ?? tone) === "pqc" ? "bg-pqc" : "bg-accent-2"}`}
                style={{ width: `${(i.count / max) * 100}%` }}
              />
            </span>
            <span className="mono text-right text-ink-2">{i.count.toLocaleString()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
