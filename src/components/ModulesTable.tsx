/**
 * Virtualized, sortable table of certificates (TanStack Table + Virtual), following the
 * kemist-dashboard DomainsTable layout: fixed row height, fixed table layout, percent widths.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ModuleRow } from "../data/types";
import { iso } from "../lib/dates";
import { FamilyTag, StatusTag } from "./ui";
import { PQC_FAMILIES } from "../lib/pqc";

const ROW_HEIGHT = 40;
const col = createColumnHelper<ModuleRow>();

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Narrowest width (px) at which the content fits without being cut off. */
    min: number;
    /** Lower shows first: columns join in this order while their minimum widths fit. */
    priority: number;
    /** Share of the leftover width (only the long text columns grow). */
    grow?: number;
  }
}

const ellipsis = (s: string) => (
  <span className="block truncate" title={s}>
    {s}
  </span>
);

const COLUMNS = [
  col.accessor("cert", {
    header: "Cert",
    meta: { min: 76, priority: 0 },
    cell: (c) => (
      <Link to="/modules/$cert" params={{ cert: String(c.getValue()) }} className="mono" onClick={(e) => e.stopPropagation()}>
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("standard", { header: "FIPS", meta: { min: 70, priority: 6 } }),
  col.accessor("status", { header: "Status", meta: { min: 108, priority: 1 }, cell: (c) => <StatusTag status={c.getValue()} /> }),
  col.accessor("vendor", { header: "Vendor", meta: { min: 170, priority: 3, grow: 2 }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("module", { header: "Module", meta: { min: 230, priority: 2, grow: 3 }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("type", { header: "Type", meta: { min: 142, priority: 7 }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("level", { header: "Lvl", meta: { min: 54, priority: 8 } }),
  col.accessor("embodiment", { header: "Embodiment", meta: { min: 196, priority: 11 }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor((r) => iso(r.first), {
    id: "first",
    header: "Validated",
    meta: { min: 114, priority: 5 },
    cell: (c) => <span className="mono whitespace-nowrap text-ink-2">{c.getValue() || "—"}</span>,
  }),
  col.accessor((r) => iso(r.sunset), {
    id: "sunset",
    header: "Sunset",
    meta: { min: 114, priority: 10 },
    cell: (c) => <span className="mono whitespace-nowrap text-ink-2">{c.getValue() || "—"}</span>,
  }),
  col.accessor((r) => r.algorithms.length, {
    id: "algs",
    header: "Algs",
    meta: { min: 62, priority: 9 },
    cell: (c) => <span className="mono text-ink-2">{c.getValue()}</span>,
  }),
  col.accessor((r) => r.pqc.join(" "), {
    id: "pqc",
    header: "PQC",
    meta: { min: 214, priority: 4 },
    sortDescFirst: true,
    cell: (c) => {
      const fams = c.row.original.families.filter((f) => PQC_FAMILIES.has(f));
      return (
        <span className="flex items-center gap-1 whitespace-nowrap" title={fams.join(", ")}>
          {fams.slice(0, 2).map((f) => (
            <FamilyTag key={f} family={f} />
          ))}
          {fams.length > 2 && <span className="text-[11px] text-ink-3">+{fams.length - 2}</span>}
        </span>
      );
    },
  }),
];

export function ModulesTable({
  rows,
  sorting,
  onSortingChange,
}: {
  rows: ModuleRow[];
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
}) {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1000 : Math.max(320, window.innerWidth - 340)));
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Show the columns whose content fits, most important first, so nothing is cut off; then share out the rest.
  const { columns, widths } = useMemo(() => {
    const keep = new Set<(typeof COLUMNS)[number]>();
    let used = 0;
    for (const c of [...COLUMNS].sort((a, b) => a.meta!.priority - b.meta!.priority)) {
      if (keep.size < 3 || used + c.meta!.min <= width) {
        keep.add(c);
        used += c.meta!.min;
      }
    }
    const cols = COLUMNS.filter((c) => keep.has(c));
    const grow = cols.reduce((a, c) => a + (c.meta!.grow ?? 0), 0);
    const extra = Math.max(0, width - used);
    return { columns: cols, widths: cols.map((c) => Math.floor(c.meta!.min + (grow ? (extra * (c.meta!.grow ?? 0)) / grow : 0))) };
  }, [width]);
  // TanStack Table returns non-memoizable functions; the React Compiler lint rule flags that.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (u) => onSortingChange(typeof u === "function" ? u(sorting) : u),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const total = widths.reduce((a, b) => a + b, 0);

  return (
    <div ref={parentRef} className="relative h-[72vh] overflow-auto rounded-md border border-line bg-surface">
      <table className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", width: `${total}px` }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface-2">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                    className="overflow-hidden whitespace-nowrap border-b border-line px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-3"
                  >
                    <button type="button" onClick={h.column.getToggleSortingHandler()} className="flex items-center gap-1 uppercase hover:text-ink">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <span aria-hidden>{sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((vr) => {
            const row = tableRows[vr.index];
            if (!row) return null;
            return (
              <tr
                key={row.id}
                onClick={() => navigate({ to: "/modules/$cert", params: { cert: String(row.original.cert) } })}
                className="absolute left-0 right-0 cursor-pointer hover:bg-surface-2"
                style={{ transform: `translateY(${vr.start}px)`, height: `${ROW_HEIGHT}px`, width: "100%", display: "table", tableLayout: "fixed" }}
              >
                {row.getVisibleCells().map((cell, i) => (
                  <td key={cell.id} className="overflow-hidden border-b border-line-2 px-3 py-1 align-middle" style={{ width: `${widths[i]}px` }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {tableRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-ink-3">
                No certificates match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
