/**
 * Virtualized, sortable table of certificates (TanStack Table + Virtual), following the
 * kemist-dashboard DomainsTable layout: fixed row height, fixed table layout, percent widths.
 */
import { useMemo, useRef } from "react";
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
import { isAtLeast, useBreakpoint, type Breakpoint } from "../lib/useBreakpoint";
import { FamilyTag, StatusTag } from "./ui";
import { PQC_FAMILIES } from "../lib/pqc";

const ROW_HEIGHT = 40;
const col = createColumnHelper<ModuleRow>();

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    hideBelow?: Breakpoint;
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
    size: 70,
    cell: (c) => (
      <Link to="/modules/$cert" params={{ cert: String(c.getValue()) }} className="mono" onClick={(e) => e.stopPropagation()}>
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("standard", { header: "FIPS", size: 55, meta: { hideBelow: "lg" } }),
  col.accessor("status", { header: "Status", size: 90, cell: (c) => <StatusTag status={c.getValue()} /> }),
  col.accessor("vendor", { header: "Vendor", size: 200, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("module", { header: "Module", size: 300, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("type", { header: "Type", size: 110, meta: { hideBelow: "md" }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor("level", { header: "Lvl", size: 45, meta: { hideBelow: "md" } }),
  col.accessor("embodiment", { header: "Embodiment", size: 160, meta: { hideBelow: "2xl" }, cell: (c) => ellipsis(c.getValue()) }),
  col.accessor((r) => iso(r.first), {
    id: "first",
    header: "Validated",
    size: 95,
    meta: { hideBelow: "lg" },
    cell: (c) => <span className="mono whitespace-nowrap text-ink-2">{c.getValue() || "—"}</span>,
  }),
  col.accessor((r) => iso(r.sunset), {
    id: "sunset",
    header: "Sunset",
    size: 95,
    meta: { hideBelow: "xl" },
    cell: (c) => <span className="mono whitespace-nowrap text-ink-2">{c.getValue() || "—"}</span>,
  }),
  col.accessor((r) => r.algorithms.length, {
    id: "algs",
    header: "Algs",
    size: 55,
    meta: { hideBelow: "lg" },
    cell: (c) => <span className="mono text-ink-2">{c.getValue()}</span>,
  }),
  col.accessor((r) => r.pqc.join(" "), {
    id: "pqc",
    header: "PQC",
    size: 150,
    meta: { hideBelow: "sm" },
    sortDescFirst: true,
    cell: (c) => (
      <span className="flex gap-1 overflow-hidden">
        {c.row.original.families.filter((f) => PQC_FAMILIES.has(f)).map((f) => (
          <FamilyTag key={f} family={f} />
        ))}
      </span>
    ),
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
  const bp = useBreakpoint();
  const navigate = useNavigate();
  const columns = useMemo(() => COLUMNS.filter((c) => !c.meta?.hideBelow || isAtLeast(bp, c.meta.hideBelow)), [bp]);
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
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const widths = columns.map((c) => c.size ?? 120);
  const total = widths.reduce((a, b) => a + b, 0);
  const pct = widths.map((w) => (w / total) * 100);

  return (
    <div ref={parentRef} className="relative h-[72vh] overflow-auto rounded-md border border-line bg-surface">
      <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", minWidth: `${Math.min(total, 760)}px` }}>
        <colgroup>
          {pct.map((p, i) => (
            <col key={i} style={{ width: `${p}%` }} />
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
                  <td key={cell.id} className="overflow-hidden border-b border-line-2 px-3 py-1 align-middle" style={{ width: `${pct[i]}%` }}>
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
