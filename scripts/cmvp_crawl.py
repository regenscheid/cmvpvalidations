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
import argparse, csv, datetime, json, sys, time
from concurrent.futures import ThreadPoolExecutor
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


def crawl_certs(a, data, cache):
    standards = ["140-3", "140-2", "140-1"] if a.standard == "all" else a.standard.split(",")
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
        if a.refresh or not old or old.get("list") != rows[n]:
            todo.append(n)
    print(f"CMVP: {len(nums)} certificates listed, {len(todo)} new or changed")

    def one(n):
        time.sleep(a.delay)
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
        return n, rec

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


def crawl_cavp(a, data, cache):
    ids = set()
    for p in (data / "cmvp").glob("*.json"):
        ids |= {e["cavp_id"] for e in (load(p) or {}).get("approved", []) if e["cavp_id"]}
    cutoff = (datetime.date.today() - datetime.timedelta(days=a.cavp_max_age)).isoformat() if a.cavp_max_age else ""
    todo = []
    for i in sorted(ids, key=int):
        old = load(data / "cavp" / f"{i}.json")
        if a.refresh or not old or (cutoff and old.get("fetched", "") < cutoff):
            todo.append(i)
    if a.cavp_limit:
        todo = todo[:a.cavp_limit]
    print(f"CAVP: {len(ids)} validations cited, {len(todo)} to fetch")

    def one(i):
        time.sleep(a.delay)
        refetch = a.refresh or (data / "cavp" / f"{i}.json").exists()
        try:
            page = L.fetch(L.CAVP_EXPANDED.format(i), cache / "cavp_x" / f"{i}.html", refresh=refetch,
                           check=L.cavp_page_ok, retries=2)
            return i, L.parse_cavp(i, page)
        except RuntimeError as e:
            # Very large validations time out (HTTP 524) in the expanded view; fall back to the
            # default view plus one capability request per row.
            print(f"  cavp {i}: expanded view failed ({str(e)[-60:]}); using collapsed view", file=sys.stderr)
            page = L.fetch(L.CAVP_DETAIL.format(i), cache / "cavp" / f"{i}.html", refresh=refetch, check=L.cavp_page_ok)
            caps = lambda c: L.fetch(L.CAVP_CAPS.format(c), cache / "caps" / f"{c}.json", refresh=refetch)
            return i, L.parse_cavp_collapsed(i, page, caps)

    errors, done = [], 0
    with ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(one, i) for i in todo]
        for k, fu in enumerate(futs, 1):
            try:
                i, rec = fu.result()
            except Exception as e:  # noqa: BLE001
                errors.append(str(e)); continue
            rec["fetched"] = TODAY
            done += save(data / "cavp" / f"{i}.json", rec)
            if k % 100 == 0:
                print(f"  cavp {k}/{len(todo)}")
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
        w = csv.writer(f); w.writerow(["cert", "status", "vendor", "module", "algorithm", "cavp_cert", "cavp_id"])
        for r in certs:
            for e in r["approved"]:
                w.writerow([r["cert"], r["status"], r["vendor"], r["module"], e["algorithm"], e["cavp_cert"], e["cavp_id"]])
    print(f"wrote {data / 'cmvp_certs.csv'} and {data / 'cmvp_algorithms.csv'} ({len(certs)} certificates)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--standard", default="140-3", help="140-3, 140-2, 140-1, a comma list, or 'all'")
    ap.add_argument("--data", default="data")
    ap.add_argument("--cache", default="cache", help="raw HTML cache (not committed)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--delay", type=float, default=0.2, help="seconds each worker waits per request")
    ap.add_argument("--refresh", action="store_true", help="refetch every page")
    ap.add_argument("--no-cavp", action="store_true")
    ap.add_argument("--cavp-max-age", type=int, default=0, help="refetch CAVP records older than N days (0: never)")
    ap.add_argument("--cavp-limit", type=int, default=0, help="fetch at most N CAVP validations this run")
    ap.add_argument("--limit", type=int, default=0, help="debug: only the newest N certificates")
    a = ap.parse_args()
    data, cache = Path(a.data), Path(a.cache)
    errs = crawl_certs(a, data, cache)
    if not a.no_cavp:
        errs += crawl_cavp(a, data, cache)
    write_csvs(data)
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
