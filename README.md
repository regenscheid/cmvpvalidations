# cmvpvalidations

A searchable index of NIST CMVP certificates, with each certificate's approved algorithms linked
to the CAVP validations it cites, down to tested capabilities and operating environments.
Published at https://cmvpcerts.net/ and kept current by a scheduled GitHub Action.

Scope today: every FIPS 140-3, FIPS 140-2 and FIPS 140-1 certificate (Active, Historical, Revoked). The
daily Action crawls FIPS 140-3 only; FIPS 140-2 and 140-1 have no active certificates left and were captured
locally with `--standard 140-2` and `--standard 140-1`. The crawler also takes `all`.

## Layout

| Path | What |
|---|---|
| `scripts/cmvp_lib.py` | Fetching (curl) and parsing of CSRC certificate, search-list and CAVP pages |
| `scripts/cmvp_crawl.py` | Incremental crawler → `data/` |
| `scripts/build_site_data.py` | `data/` → `public/data/` (what the web app loads) |
| `data/cmvp/<cert>.json` | One file per certificate: every field on the page plus its search-list row |
| `data/cavp/<id>.json` | One file per cited CAVP validation: implementation, OEs, per-algorithm capabilities |
| `data/cavp_refs.json` | FIPS 140-2 and 140-1 citations by CAVP source and number (`AES:4030`, `A:884`) → validation id |
| `data/cavp_ref_aliases.json` | Hand-checked stand-ins for citations that do not resolve, with the reason |
| `data/esv/<n>.json` | Entropy source (ESV) certificate E<n>: noise source, OEs, conditioning-component CAVP certificates, vendor, history |
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

FIPS 140-2 and 140-1 pages cite CAVP certificates by source and number (`details?source=AES&number=4030`) rather
than by validation id, often several per algorithm, and include pre-ACVP certificates numbered per
algorithm. The crawler fetches each reference once in the expanded view, records its validation id in
`data/cavp_refs.json`, and writes the id back into the certificate records. They also name algorithms
broadly ("AES", "SHS", "CVL"); the site shows every CAVP algorithm of that family on the cited validation.

Some 140-2 rows have no CAVP link, only text such as "AES Cert. #5907 and HMAC Cert. #3889; key
establishment methodology ...". The text is kept as the entry's `note` (and in the `note` column of
`cmvp_algorithms.csv`), and the certificates it names become entries with `from_note: true`. Legacy numbers
count only after an algorithm word; ACVP numbers (`#C755`) stand on their own. A few certificates link an
ACVP certificate under a legacy source (`ECDSA 8130` for `A8130`), and that link fails; the crawler then
tries the same number under `A` and `C` (and, for the placeholder source `foo`, under AES, HMAC, RSA and
TDES) and accepts it only if the validation's vendor matches the certificate's. References checked by hand
(a transposed number, a sibling validation from the same submission) are listed with their reasons in
`data/cavp_ref_aliases.json`. Either way the entry takes the validation's own name, keeps the certificate's
in `cited_as`, and says why in `inferred`; the site marks these links as inferred.

Re-parse stored certificates from the cache after a parser change with `--reparse`.

Entropy source (ESV) certificates are crawled on every run (skip with `--no-esv`), with the CAVP validations
of their vetted conditioning components. Module certificates do not cite ESV certificates, so the site infers
the link: a module and an ESV certificate from the same vendor that cite the same CAVP validation. Across
vendors a shared validation is nearly always a common hardware block (Intel DRNG, Synopsys TRNG) and says
nothing about whose entropy source a module uses, so those pairs are not linked.

## Site

- **Summary**: counts by status, level, type, lab and algorithm family, each linking to a filtered table.
- **Modules**: virtualized table; filters (status, standard, type, level, embodiment, algorithm
  family, exact algorithm names, lab, free text, "lists a PQC algorithm") are kept in the URL.
- **Certificate**: every field; approved algorithms listed by family, each with the CAVP certificate it
  cites and a one-line digest of what was tested (key sizes, curves, parameter sets). A row expands to
  the full capabilities per CAVP validation and operating environment.
- **CAVP validation**: all algorithms and OEs, and which certificates cite it.
- **Algorithms**: every approved-algorithm name by family with active/all certificate counts.
- **Entropy**: ESV certificates with noise source, OEs and conditioning components, and the modules
  inferred to use each; certificate pages list their inferred entropy sources.

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
- Vendor contacts are kept by name only: phone and fax numbers are dropped, and emails (Cloudflare-obfuscated
  on CSRC) are deliberately not decoded.
- A few CSRC certificate pages render only part of their details (`"sparse": true`); vendor and
  module then come from the search list.
- csrc.nist.gov resets connections from Python's urllib (TLS fingerprint), so fetching uses curl.
