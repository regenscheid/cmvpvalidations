/** Indented capability lines from the CAVP expanded view ("  " per nesting level). */
export function Capabilities({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <p className="text-[12px] text-ink-3">No capability detail listed.</p>;
  return (
    <ul className="m-0 list-none space-y-0.5 p-0 text-[12px] leading-snug">
      {lines.map((l, i) => {
        const depth = l.length - l.trimStart().length;
        const t = l.trim();
        const idx = t.indexOf(":");
        return (
          <li key={i} style={{ paddingLeft: `${depth * 0.6}rem` }}>
            {idx > 0 ? (
              <>
                <span className="text-ink-3">{t.slice(0, idx)}:</span>
                <span className="mono">{t.slice(idx + 1)}</span>
              </>
            ) : (
              <span className="text-ink-2">{t}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
