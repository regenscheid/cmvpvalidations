#!/usr/bin/env python3
"""Crawl NIST CMVP certificates and the CAVP validations they cite into a JSON dataset.

Writes one file per record so updates diff cleanly in git:
  data/cmvp/<cert>.json        every field of the certificate page, plus its search-list row
  data/cavp/<validation>.json  the CAVP validation (expanded view): implementation, OEs, and
                               per-algorithm capabilities
  data/cmvp_certs.csv          one row per certificate
  data/cmvp_algorithms.csv     one row per (certificate, approved algorithm, CAVP validation)

Incremental: the CMVP search lists are always refetched; a certificate page is fetched only when
it is new or its status / validation dates on the list changed. CAVP validations are fetched when
first referenced (and again after --cavp-max-age days). Pass --refresh to refetch everything.

Usage:  python3 -I scripts/cmvp_crawl.py [--standard 140-3] [--data data] [--cache cache]
Only the standard library and curl are needed.
"""
import argparse, csv, datetime, json, re, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir from sys.path
import cmvp_lib as L  # noqa: E402

TODAY = datetime.date.today().isoformat()


def load(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def save(path, obj):
    """Write only when the content changed, so unchanged records leave no git diff."""
    body = json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=False) + "\n"
    if path.exists() and path.read_text() == body:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    return True


def matches_list(rec, row):
    hist = {h["date"] for h in rec.get("history", [])}
    return rec.get("status") == row["status"] and set(row["validation_dates"]) <= hist


def standards_of(a):
    return ["140-3", "140-2", "140-1"] if a.standard == "all" else a.standard.split(",")


def load_refs(data):
    """CAVP source/number references ("AES:4030", "A:884", cited by FIPS 140-2 pages) -> validation id."""
    return load(data / "cavp_refs.json") or {}


def apply_refs(rec, refs):
    for e in rec["approved"]:
        if e.get("cavp_ref") and not e["cavp_id"]:
            e["cavp_id"] = refs.get(e["cavp_ref"], "")
    return rec


def crawl_certs(a, data, cache):
    standards = standards_of(a)
    refs = load_refs(data)
    rows = {}
    for std in standards:
        for st in L.STATUSES:
            got = L.list_certs(std, st, cache, refresh=True)
            print(f"CMVP list FIPS {std} {st}: {len(got)}")
            for r in got:
                rows[r["cert"]] = {**r, "standard": std}
    nums = sorted(rows)
    if a.limit:
        nums = nums[-a.limit:]

    todo = []
    for n in nums:
        old = load(data / "cmvp" / f"{n}.json")
        if a.refresh or a.reparse or not old or old.get("list") != rows[n]:
            todo.append(n)
    print(f"CMVP: {len(nums)} certificates listed, {len(todo)} new or changed")

    def one(n):
        row, f = rows[n], cache / "cert" / f"{n}.html"
        page = L.fetch(L.CMVP_CERT.format(n), f, refresh=a.refresh, check=L.cert_page_ok)
        rec = L.parse_cert(n, page)
        if not rec["sparse"] and not matches_list(rec, row) and not a.refresh:
            page = L.fetch(L.CMVP_CERT.format(n), f, refresh=True, check=L.cert_page_ok)  # stale cache
            rec = L.parse_cert(n, page)
        if rec["sparse"]:  # fall back to what the search list shows
            rec["vendor"] = rec["vendor"] or row["vendor"]
            rec["module"] = rec["module"] or row["module"]
        rec["list"] = row
        return n, apply_refs(rec, refs)

    changed, errors = 0, []
    with ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(one, n) for n in todo]
        for i, fu in enumerate(futs, 1):
            try:
                n, rec = fu.result()
            except Exception as e:  # noqa: BLE001
                errors.append(str(e)); continue
            old = load(data / "cmvp" / f"{n}.json") or {}
            rec["fetched"] = old.get("fetched", TODAY) if {k: v for k, v in old.items() if k != "fetched"} == rec else TODAY
            changed += save(data / "cmvp" / f"{n}.json", rec)
            if i % 50 == 0:
                print(f"  certs {i}/{len(todo)}")
    gone = sorted(int(p.stem) for p in (data / "cmvp").glob("*.json")
                  if int(p.stem) not in rows and (load(p) or {}).get("standard") in standards)
    if gone:
        print(f"note: {len(gone)} stored certificates no longer on the CMVP lists: {gone[:20]}", file=sys.stderr)
    print(f"CMVP: {changed} certificate files written, {len(errors)} errors")
    for e in errors[:10]:
        print("  error:", e, file=sys.stderr)
    return errors


def fetch_cavp(a, cache, key, expanded_url, collapsed_url, refetch):
    """One CAVP validation record. Very large validations time out (HTTP 524) in the expanded view;
    then fall back to the default view plus one capability request per row."""
    try:
        page = L.fetch(expanded_url, cache / "cavp_x" / f"{key}.html", refresh=refetch, check=L.cavp_page_ok, retries=2)
        return L.parse_cavp(L.cavp_id_of(page) or key, page)
    except RuntimeError as e:
        print(f"  cavp {key}: expanded view failed ({str(e)[-60:]}); using collapsed view", file=sys.stderr)
        page = L.fetch(collapsed_url, cache / "cavp" / f"{key}.html", refresh=refetch, check=L.cavp_page_ok)
        caps = lambda c: L.fetch(L.CAVP_CAPS.format(c), cache / "caps" / f"{c}.json", refresh=refetch)
        return L.parse_cavp_collapsed(L.cavp_id_of(page) or key, page, caps)


def vendor_key(v):
    """A vendor name reduced for comparison: "Red Hat®, Inc." and "Red Hat, LLC" both give "redhat"."""
    name = (v.get("name", "") if isinstance(v, dict) else v or "").lower()
    name = re.sub(r"\b(inc|llc|ltd|limited|corp|corporation|co|company|ag|gmbh|plc|sa|bv|oy|ab)\b\.?", "", name)
    return re.sub(r"[^a-z0-9]", "", name)


def crawl_cavp(a, data, cache):
    """Fetch the CAVP validations cited by certificates of the standards being crawled."""
    standards = set(standards_of(a))
    certs = [r for r in (load(p) for p in (data / "cmvp").glob("*.json")) if r and r.get("standard") in standards]
    refs = load_refs(data)
    ids, unresolved, vendors = set(), set(), {}
    for r in certs:
        for e in r.get("approved", []):
            if e.get("cavp_ref"):
                vendors.setdefault(e["cavp_ref"], set()).add(vendor_key(r.get("vendor")))
            if e["cavp_id"]:
                ids.add(e["cavp_id"])
            elif e.get("cavp_ref"):
                if e["cavp_ref"] in refs:
                    ids.add(refs[e["cavp_ref"]])
                else:
                    unresolved.add(e["cavp_ref"])
    errors, done = [], 0

    def run(jobs, label, worker, on_result):
        # Handle results as they finish, so one slow validation never holds back saving the rest.
        with ThreadPoolExecutor(a.workers) as ex:
            futs = [ex.submit(worker, j) for j in jobs]
            for k, fu in enumerate(as_completed(futs), 1):
                try:
                    on_result(*fu.result())
                except Exception as e:  # noqa: BLE001
                    errors.append(str(e))
                if k % 100 == 0:
                    print(f"  {label} {k}/{len(jobs)}")

    def store(rec):
        nonlocal done
        rec["fetched"] = TODAY
        done += save(data / "cavp" / f"{rec['cavp_id']}.json", rec)

    def fetch_ref(src, num):
        q = urllib.parse.quote
        key = f"{src}_{num}".replace("/", "_")
        rec = fetch_cavp(a, cache / "by_ref", key, L.CAVP_BY_REF.format(q(src), q(num)),
                         L.CAVP_DETAIL.split("?")[0] + f"?source={q(src)}&number={q(num)}", a.refresh)
        if not rec["cavp_id"].isdigit():
            raise RuntimeError(f"no validation id on the CAVP page for {src}:{num}")
        return rec

    # 1. FIPS 140-2 references by source and number: one expanded-view request gives the id and the record.
    # Hand-checked aliases (data/cavp_ref_aliases.json) stand in for references that do not resolve.
    aliases = load(data / "cavp_ref_aliases.json") or {}
    for ref in sorted(unresolved & aliases.keys()):
        target = aliases[ref]["ref"]
        if target not in refs:
            try:
                rec = fetch_ref(*target.split(":", 1))
            except RuntimeError as e:
                errors.append(f"alias {ref} -> {target}: {e}")
                continue
            refs[target] = rec["cavp_id"]
            store(rec)
        refs[ref] = refs[target]
        ids.add(refs[ref])
        unresolved.discard(ref)
        print(f"  cavp {ref}: using alias {target} (validation {refs[ref]})", file=sys.stderr)
    if aliases:
        save(data / "cavp_refs.json", dict(sorted(refs.items())))
    todo_refs = sorted(unresolved)
    if a.cavp_limit:
        todo_refs = todo_refs[:a.cavp_limit]
    if unresolved:
        print(f"CAVP: {len(unresolved)} source/number references unresolved, {len(todo_refs)} to fetch")

    def by_ref(ref):
        src, num = ref.split(":", 1)
        try:
            return ref, fetch_ref(src, num)
        except RuntimeError:
            if src in ("A", "C"):
                raise
        # Some 140-2 certificates link an ACVP certificate under a legacy source ("ECDSA 8130" for A8130),
        # and that link fails. Take the same number under A or C, but only from the certificate's vendor.
        # "foo" is a placeholder source on a few KTS rows; those numbers are usually AES certificates.
        alts = (("AES", "HMAC", "RSA", "TDES") if src == "foo" else ()) + ("A", "C")
        for alt in alts:
            try:
                rec = fetch_ref(alt, num)
            except RuntimeError:
                continue
            if vendor_key(rec.get("vendor")) in vendors.get(ref, ()):
                print(f"  cavp {ref}: link fails; using {rec['cavp_cert']} (validation {rec['cavp_id']}, same vendor)", file=sys.stderr)
                return ref, rec
        raise RuntimeError(f"failed to fetch CAVP {ref}, and no {num} under {', '.join(alts)} from the same vendor")

    def got_ref(ref, rec):
        refs[ref] = rec["cavp_id"]
        ids.add(rec["cavp_id"])
        store(rec)
        if len(refs) % 500 == 0:  # checkpoint, so an interrupted run keeps what it resolved
            save(data / "cavp_refs.json", dict(sorted(refs.items())))

    run(todo_refs, "cavp refs", by_ref, got_ref)
    if todo_refs:
        save(data / "cavp_refs.json", dict(sorted(refs.items())))

    # 2. Validations by id (FIPS 140-3 links, and refetches of old records).
    cutoff = (datetime.date.today() - datetime.timedelta(days=a.cavp_max_age)).isoformat() if a.cavp_max_age else ""
    fetched_now = set(refs[r] for r in todo_refs if r in refs)
    todo = []
    for i in sorted(ids - fetched_now, key=int):
        old = load(data / "cavp" / f"{i}.json")
        if a.refresh or not old or (cutoff and old.get("fetched", "") < cutoff):
            todo.append(i)
    if a.cavp_limit:
        todo = todo[:max(a.cavp_limit - len(todo_refs), 0)]
    print(f"CAVP: {len(ids)} validations cited, {len(todo)} to fetch by id")

    def by_id(i):
        refetch = a.refresh or (data / "cavp" / f"{i}.json").exists()
        return (fetch_cavp(a, cache, i, L.CAVP_EXPANDED.format(i), L.CAVP_DETAIL.format(i), refetch),)

    run(todo, "cavp", by_id, store)

    # 3. Write the resolved validation ids into the certificate records.
    # A reference resolved to a validation under another name ("foo 5033" as AES 5033, or an alias) takes
    # the validation's own name; the certificate's label is kept in "cited_as", the reason in "inferred".
    labels = {}

    def label_of(i):
        if i not in labels:
            labels[i] = (load(data / "cavp" / f"{i}.json") or {}).get("cavp_cert", "")
        return labels[i]

    linked = 0
    for r in certs:
        apply_refs(r, refs)
        for e in r["approved"]:
            if e.get("cavp_ref") and e["cavp_id"]:
                name = label_of(e["cavp_id"])
                src, num = e["cavp_ref"].split(":", 1)
                cited = f"{src}{num}" if src in ("A", "C") else f"{src} {num}"
                if name and name != cited:
                    e["cavp_cert"], e["cited_as"] = name, cited
                    e["inferred"] = aliases[e["cavp_ref"]]["why"] if e["cavp_ref"] in aliases else (
                        f"{cited} does not resolve on CAVP; {name} has the same number and the certificate's vendor")
        linked += save(data / "cmvp" / f"{r['cert']}.json", r)
    if linked:
        print(f"CMVP: linked CAVP validation ids into {linked} certificate files")
    print(f"CAVP: {done} validation files written, {len(errors)} errors")
    for e in errors[:10]:
        print("  error:", e, file=sys.stderr)
    return errors


def write_csvs(data):
    certs = sorted((load(p) for p in (data / "cmvp").glob("*.json")), key=lambda r: r["cert"])
    cols = ["cert", "standard", "status", "vendor", "module", "type", "embodiment", "level", "sunset",
            "first_validated", "last_updated", "labs", "caveat", "software_versions", "hardware_versions",
            "firmware_versions", "approved_count", "security_policy", "url"]
    with open(data / "cmvp_certs.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in certs:
            w.writerow([len(r["approved"]) if c == "approved_count" else r.get(c, "") for c in cols])
    with open(data / "cmvp_algorithms.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["cert", "status", "vendor", "module", "algorithm", "cavp_cert", "cavp_id", "note"])
        for r in certs:
            for e in r["approved"]:
                w.writerow([r["cert"], r["status"], r["vendor"], r["module"], e["algorithm"], e["cavp_cert"], e["cavp_id"], e.get("note", "")])
    print(f"wrote {data / 'cmvp_certs.csv'} and {data / 'cmvp_algorithms.csv'} ({len(certs)} certificates)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--standard", default="140-3", help="140-3, 140-2, 140-1, a comma list, or 'all'")
    ap.add_argument("--data", default="data")
    ap.add_argument("--cache", default="cache", help="raw HTML cache (not committed)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--delay", type=float, default=0.2, help="seconds each worker waits per request")
    ap.add_argument("--refresh", action="store_true", help="refetch every page")
    ap.add_argument("--reparse", action="store_true", help="re-parse every certificate from the cache (after a parser change)")
    ap.add_argument("--no-cavp", action="store_true")
    ap.add_argument("--cavp-max-age", type=int, default=0, help="refetch CAVP records older than N days (0: never)")
    ap.add_argument("--cavp-limit", type=int, default=0, help="fetch at most N CAVP validations this run")
    ap.add_argument("--limit", type=int, default=0, help="debug: only the newest N certificates")
    a = ap.parse_args()
    L.DELAY = a.delay
    data, cache = Path(a.data), Path(a.cache)
    errs = crawl_certs(a, data, cache)
    if not a.no_cavp:
        errs += crawl_cavp(a, data, cache)
    write_csvs(data)
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
