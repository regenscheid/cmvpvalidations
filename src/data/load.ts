import { useEffect, useState } from "react";
import type { AlgorithmRow, CavpRecord, CertRecord, EsvRecord, EsvRow, Meta, ModuleRow } from "./types";

// Every data file is static JSON under <base>/data/. Per-record files (cmvp/, cavp/, esv/) are stored
// gzipped (<path>.gz) to keep the published site small; they are inflated here. Responses are
// memoised for the session so moving between pages never refetches.
const cache = new Map<string, Promise<unknown>>();

const gzipped = (path: string) => /^(cmvp|cavp|esv)\//.test(path);

async function decode(r: Response): Promise<unknown> {
  const buf = new Uint8Array(await r.arrayBuffer());
  // Some servers send .gz with Content-Encoding: gzip, and then the browser has already inflated it.
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const body = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(body).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

export function loadJson<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    const file = gzipped(path) ? `${path}.gz` : path;
    p = fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
      // A missing file is a 404 on Pages but the SPA's index.html from the dev server.
      if (r.status === 404 || (r.headers.get("content-type") ?? "").includes("html"))
        throw new Error("not in this snapshot yet (it is fetched on the next crawl)");
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} for data/${file}`);
      return decode(r);
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export type Loaded<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T };

export function useJson<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ path: string | null; value: Loaded<T> }>({ path, value: { kind: "loading" } });
  useEffect(() => {
    if (!path) return;
    let live = true;
    loadJson<T>(path).then(
      (data) => live && setState({ path, value: { kind: "ready", data } }),
      (e: unknown) => live && setState({ path, value: { kind: "error", message: String(e) } }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return state.path === path ? state.value : { kind: "loading" };
}

export const useMeta = () => useJson<Meta>("meta.json");
export const useModules = () => useJson<ModuleRow[]>("modules.json");
export const useAlgorithms = () => useJson<AlgorithmRow[]>("algorithms.json");
export const useCert = (cert: number | string) => useJson<CertRecord>(`cmvp/${cert}.json`);
export const useCavp = (id: string | null) => useJson<CavpRecord>(id ? `cavp/${id}.json` : null);
export const useEsvs = () => useJson<EsvRow[]>("esv.json");
export const useEsv = (n: number | string) => useJson<EsvRecord>(`esv/${n}.json`);

/** Several JSON files at once (e.g. every CAVP validation a certificate cites). */
export function useJsonMany<T>(paths: string[]): Record<string, Loaded<T>> {
  const key = paths.join("\n");
  const [state, setState] = useState<{ key: string; value: Record<string, Loaded<T>> }>({ key, value: {} });
  useEffect(() => {
    let live = true;
    const list = key ? key.split("\n") : [];
    for (const p of list) {
      loadJson<T>(p).then(
        (data) => live && setState((s) => (s.key === key ? { key, value: { ...s.value, [p]: { kind: "ready", data } } } : s)),
        (e: unknown) =>
          live && setState((s) => (s.key === key ? { key, value: { ...s.value, [p]: { kind: "error", message: String(e) } } } : s)),
      );
    }
    return () => {
      live = false;
    };
  }, [key]);
  return state.key === key ? state.value : {};
}

export const useCavps = (ids: string[]) => useJsonMany<CavpRecord>(ids.map((i) => `cavp/${i}.json`));
