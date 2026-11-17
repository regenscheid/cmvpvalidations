/**
 * One-line digest of an algorithm's tested capabilities: the most telling "Key: values" pairs,
 * with values merged across every capability set (OEs, CAVP certs) the module cites.
 */
const PRIORITY = [
  "parameter sets", "parameter set", "lms modes", "lmots modes", "key length", "key size", "modulo", "curve",
  "curves", "hash algorithm", "hash algorithms", "mode", "mac", "digest size", "output length", "functions",
  "function", "direction", "domain parameter generation methods", "kas role", "schemes", "scheme",
];

export function summarizeCaps(capSets: string[][], maxKeys = 3, maxValues = 8): string {
  const byKey = new Map<string, { label: string; values: string[] }>();
  for (const lines of capSets) {
    for (const raw of lines) {
      const t = raw.trim();
      const i = t.indexOf(":");
      if (i <= 0) continue;
      const label = t.slice(0, i).trim();
      const vals = t.slice(i + 1).split(",").map((v) => v.trim()).filter(Boolean);
      if (!vals.length) continue;
      const k = label.toLowerCase();
      const e = byKey.get(k) ?? { label, values: [] };
      for (const v of vals) if (!e.values.includes(v)) e.values.push(v);
      byKey.set(k, e);
    }
  }
  const keys = [...byKey.keys()];
  const ranked = [
    ...PRIORITY.filter((k) => byKey.has(k)),
    ...keys.filter((k) => !PRIORITY.includes(k)),
  ].slice(0, maxKeys);
  return ranked
    .map((k) => {
      const e = byKey.get(k)!;
      const shown = e.values.slice(0, maxValues).join(", ");
      return `${e.label}: ${shown}${e.values.length > maxValues ? ` +${e.values.length - maxValues}` : ""}`;
    })
    .join(" · ");
}
