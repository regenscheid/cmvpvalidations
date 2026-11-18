#!/usr/bin/env python3
"""Turn the crawled dataset (data/) into the JSON the web app loads (public/data/).

  public/data/meta.json        snapshot date and counts
  public/data/modules.json     one compact row per certificate (drives the table and facets)
  public/data/algorithms.json  each approved-algorithm name with its family and module counts
  public/data/cmvp/<n>.json.gz    full certificate record, gzipped (loaded on the detail page)
  public/data/cavp/<id>.json.gz   full CAVP validation record, gzipped (loaded on demand)

Usage: python3 -I scripts/build_site_data.py [--data data] [--out public/data]
"""
import argparse, gzip, json, re, shutil
from collections import Counter, defaultdict
from pathlib import Path

# Ordered: first match wins. Groups the ~140 CAVP algorithm names into families for filtering.
FAMILIES = [
    (r"^ML-DSA\b", "ML-DSA"), (r"^ML-KEM\b", "ML-KEM"), (r"^SLH-DSA\b", "SLH-DSA"),
    (r"^LMS\b", "LMS"), (r"^XMSS\b", "XMSS"),
    (r"^AES\b", "AES"), (r"(?i)^(TDES|Triple-DES|3DES|TDEA)\b", "TDES"),
    (r"DRBG", "DRBG"), (r"^RNG\b|X9\.31|186-2.*RNG", "RNG (legacy)"), (r"^HMAC\b", "HMAC"),
    (r"^(SHS\b|SHA-1|SHA2-|SHA-\s?(1|224|256|384|512)\b)", "SHA-1/SHA-2"),
    (r"^(SHA-3|SHA3-|SHAKE|cSHAKE|KMAC|TupleHash|ParallelHash)", "SHA-3 family"),
    (r"ECDSA", "ECDSA"), (r"(?i)^EDDSA", "EdDSA"), (r"^DSA\b", "DSA"), (r"^RSA\b", "RSA"),
    (r"^KAS\b", "KAS"), (r"^KTS\b", "KTS"), (r"^KDA\b", "KDA"), (r"KDF", "KDF"),
    (r"^CVL\b", "CVL"), (r"^Safe Primes", "Safe Primes"), (r"^Conditioning Component", "Conditioning"),
]
PQC = {"ML-DSA", "ML-KEM", "SLH-DSA", "LMS", "XMSS"}


def family(name):
    for pat, fam in FAMILIES:
        if re.search(pat, name):
            return fam
    return "Other"


def compact(obj, path):
    """data/ is indented for readable diffs; the site gets each record minified and gzipped
    (<name>.json.gz, about 15x smaller), which src/data/load.ts inflates. mtime=0 keeps the
    bytes identical from build to build."""
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    path.with_name(path.name + ".gz").write_bytes(gzip.compress(body, 9, mtime=0))


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
        compact(r, out / "cmvp" / f"{r['cert']}.json")
    for i in cavp_have:
        compact(json.loads((data / "cavp" / f"{i}.json").read_text()), out / "cavp" / f"{i}.json")

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
