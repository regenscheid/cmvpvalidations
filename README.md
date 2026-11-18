# cmvpvalidations

A searchable index of NIST CMVP certificates, with each certificate's approved algorithms linked
to the CAVP validations it cites, down to tested capabilities and operating environments.
Published at https://regenscheid.github.io/cmvpvalidations/ and kept current by a scheduled GitHub Action.

Scope today: every FIPS 140-3 and FIPS 140-2 certificate (Active, Historical, Revoked). The daily
Action crawls FIPS 140-3 only; FIPS 140-2 has no active certificates left and was captured locally with
`--standard 140-2`. The crawler also takes `140-1` or `all`.

## Layout

| Path | What |
|---|---|
| `scripts/cmvp_lib.py` | Fetching (curl) and parsing of CSRC certificate, search-list and CAVP pages |
| `scripts/cmvp_crawl.py` | Incremental crawler → `data/` |
| `scripts/build_site_data.py` | `data/` → `public/data/` (what the web app loads) |
| `data/cmvp/<cert>.json` | One file per certificate: every field on the page plus its search-list row |
| `data/cavp/<id>.json` | One file per cited CAVP validation: implementation, OEs, per-algorithm capabilities |
| `data/cavp_refs.json` | FIPS 140-2 citations by CAVP source and number (`AES:4030`, `A:884`) → validation id |
| `data/cmvp_certs.csv`, `data/cmvp_algorithms.csv` | Flat exports (cert rows; cert × algorithm × CAVP) |
| `src/` | Vite + React + TanStack Router/Table/Virtual + Tailwind app (same stack as kemist-dashboard) |
| `scripts/cmvp_pqc.py`, `scripts/make_reports.py`, `out/`, `reports/` | The original ML-DSA / ML-KEM survey (Oct 29 2026), kept as is |

`data/` is committed so its git history records every change CMVP makes. `cache/` (raw HTML) and
`public/data/` (generated) are not.

## Run locally

```sh
python3 -I scripts/cmvp_crawl.py            # incremental; first run is the bulk capture
python3 -I scripts/build_site_data.py
pnpm install
pnpm dev                                    # http://localhost:5173/
```

Crawler options: `--refresh` refetches everything; `--cavp-max-age N` refetches CAVP records older
than N days; `--cavp-limit N` caps CAVP fetches per run; `--no-cavp` skips them; `--limit N` crawls
only the newest N certificates (debugging).

Incremental rules: the CMVP search lists are always refetched; a certificate page is refetched when
it is new or its status or validation dates changed on the list; a CAVP validation is fetched the
first time a certificate cites it. Records are rewritten only when their content changes. CAVP work is
limited to certificates of the standards named by `--standard`.

FIPS 140-2 pages cite CAVP certificates by source and number (`details?source=AES&number=4030`) rather
than by validation id, often several per algorithm, and include pre-ACVP certificates numbered per
algorithm. The crawler fetches each reference once in the expanded view, records its validation id in
`data/cavp_refs.json`, and writes the id back into the certificate records. They also name algorithms
broadly ("AES", "SHS", "CVL"); the site shows every CAVP algorithm of that family on the cited validation.

## Site

- **Summary**: counts by status, level, type, lab and algorithm family, each linking to a filtered table.
- **Modules**: virtualized table; filters (status, standard, type, level, embodiment, algorithm
  family, exact algorithm names, lab, free text, "lists a PQC algorithm") are kept in the URL.
- **Certificate**: every field; approved algorithms listed by family, each with the CAVP certificate it
  cites and a one-line digest of what was tested (key sizes, curves, parameter sets). A row expands to
  the full capabilities per CAVP validation and operating environment.
- **CAVP validation**: all algorithms and OEs, and which certificates cite it.
- **Algorithms**: every approved-algorithm name by family with active/all certificate counts.

## Deploy (one-time setup)

1. Push to `main` of the GitHub repo (regenscheid/cmvpvalidations).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write** (the update job commits `data/`).

Workflows:

- `update-data.yml`: daily crawl; commits changed records, then calls `deploy.yml`.
- `deploy.yml`: builds `public/data/` and the site and publishes to Pages (also on pushes to main).
- `ci.yml`: lint, typecheck, unit tests, build.

The site's base path is `/<repo name>/`. Set `BASE_PATH=/` for a custom domain.

## Notes

- Not an official NIST product; the certificate and Security Policy are authoritative.
- Vendor contact emails are Cloudflare-obfuscated on CSRC and are deliberately not decoded.
- A few CSRC certificate pages render only part of their details (`"sparse": true`); vendor and
  module then come from the search list.
- csrc.nist.gov resets connections from Python's urllib (TLS fingerprint), so fetching uses curl.
