#!/usr/bin/env python3
"""Turn the crawled dataset (data/) into the JSON the web app loads (public/data/).

  public/data/meta.json        snapshot date and counts
  public/data/modules.json     one compact row per certificate (drives the table and facets)
  public/data/algorithms.json  each approved-algorithm name with its family and module counts
  public/data/cmvp/<n>.json    full certificate record (copied; loaded on the detail page)
  public/data/cavp/<id>.json   full CAVP validation record (copied; loaded on demand)

Usage: python3 -I scripts/build_site_data.py [--data data] [--out public/data]
"""
import argparse, json, re, shutil
from collections import Counter, defaultdict
from pathlib import Path

# Ordered: first match wins. Groups the ~140 CAVP algorithm names into families for filtering.
FAMILIES = [
    (r"^ML-DSA\b", "ML-DSA"), (r"^ML-KEM\b", "ML-KEM"), (r"^SLH-DSA\b", "SLH-DSA"),
    (r"^LMS\b", "LMS"), (r"^XMSS\b", "XMSS"),
    (r"^AES-", "AES"), (r"^TDES-", "TDES"),
    (r"DRBG", "DRBG"), (r"^HMAC-", "HMAC"),
    (r"^(SHA-1|SHA2-)", "SHA-1/SHA-2"), (r"^(SHA3-|SHAKE-|cSHAKE-|KMAC-|TupleHash|ParallelHash)", "SHA-3 family"),
    (r"ECDSA", "ECDSA"), (r"^EDDSA", "EdDSA"), (r"^DSA ", "DSA"), (r"^RSA ", "RSA"),
    (r"^KAS-", "KAS"), (r"^KTS-", "KTS"), (r"^KDA ", "KDA"), (r"KDF", "KDF"),
    (r"^Safe Primes", "Safe Primes"), (r"^Conditioning Component", "Conditioning"),
]
PQC = {"ML-DSA", "ML-KEM", "SLH-DSA", "LMS", "XMSS"}


def family(name):
    for pat, fam in FAMILIES:
        if re.search(pat, name):
            return fam
    return "Other"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="public/data")
    a = ap.parse_args()
    data, out = Path(a.data), Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    (out / "cmvp").mkdir(parents=True)
    (out / "cavp").mkdir(parents=True)

    certs = sorted((json.loads(p.read_text()) for p in (data / "cmvp").glob("*.json")), key=lambda r: -r["cert"])
    cavp_have = {p.stem for p in (data / "cavp").glob("*.json")}
    rows, alg_all, alg_active, fetched = [], Counter(), Counter(), []
    for r in certs:
        algs = sorted({e["algorithm"] for e in r["approved"]})
        fams = sorted({family(n) for n in algs})
        for n in algs:
            alg_all[n] += 1
            if r["status"] == "Active":
                alg_active[n] += 1
        fetched.append(r.get("fetched", ""))
        rows.append({
            "cert": r["cert"], "standard": r["standard"], "status": r["status"], "vendor": r["vendor"],
            "module": r["module"], "type": r["type"], "embodiment": r["embodiment"], "level": r["level"],
            "sunset": r["sunset"], "first": r["first_validated"], "last": r["last_updated"],
            "labs": sorted({h["lab"] for h in r["history"] if h["lab"]}), "caveat": r["caveat"],
            "families": fams, "pqc": [f for f in fams if f in PQC], "algorithms": algs,
            "cavp": sorted({e["cavp_id"] for e in r["approved"] if e["cavp_id"]}, key=int),
            "sparse": r.get("sparse", False),
        })
        shutil.copyfile(data / "cmvp" / f"{r['cert']}.json", out / "cmvp" / f"{r['cert']}.json")
    for i in cavp_have:
        shutil.copyfile(data / "cavp" / f"{i}.json", out / "cavp" / f"{i}.json")

    algorithms = [{"name": n, "family": family(n), "modules": alg_all[n], "active": alg_active[n]}
                  for n in sorted(alg_all)]
    by_status = Counter(r["status"] for r in rows)
    meta = {
        "snapshot": max(f for f in fetched if f) if any(fetched) else "",
        "standards": sorted({r["standard"] for r in rows}),
        "certificates": len(rows), "by_status": dict(by_status),
        "cavp_validations": len(cavp_have),
        "cavp_cited": len({i for r in rows for i in r["cavp"]}),
        "families": sorted({f for f, _ in ((family(n), 0) for n in alg_all)}),
    }
    dump = lambda obj, p: p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    dump(rows, out / "modules.json")
    dump(algorithms, out / "algorithms.json")
    dump(meta, out / "meta.json")
    print(f"wrote {out}: {len(rows)} certificates, {len(algorithms)} algorithm names, {len(cavp_have)} CAVP records")


if __name__ == "__main__":
    main()
