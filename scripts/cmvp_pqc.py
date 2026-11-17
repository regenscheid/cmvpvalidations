#!/usr/bin/env python3
"""Find FIPS 140-3 CMVP modules whose certificate lists ML-DSA (FIPS 204) or ML-KEM (FIPS 203).

Method
  1. CMVP: list every certificate for the chosen standard/status.
  2. CMVP: fetch each certificate page and parse "Approved Algorithms" (name + CAVP certificate).
     A module qualifies for a family when an approved-algorithm entry starts with "ML-DSA" / "ML-KEM".
  3. CAVP: list all validations per family (each operation queried separately, all pages) and
     cross-check them against the module entries; report CAVP certs not used by any module.
  4. CAVP: fetch each referenced validation for parameter sets, interfaces/functions, environments.
  5. CMVP Modules In Process: match vendors (and module names) against the unattached CAVP certs.

Usage:  python3 -I cmvp_pqc.py --out OUTDIR --cache CACHEDIR [--status Active]
Only the standard library and curl are needed. Pages are cached; pass --refresh to refetch.
"""
import argparse, csv, html, json, re, subprocess, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://csrc.nist.gov"
CMVP_SEARCH = BASE + "/projects/cryptographic-module-validation-program/validated-modules/search"
CMVP_CERT = BASE + "/projects/cryptographic-module-validation-program/certificate/{}"
CMVP_MIP = BASE + "/projects/cryptographic-module-validation-program/modules-in-process/modules-in-process-list"
CAVP_SEARCH = BASE + "/projects/cryptographic-algorithm-validation-program/validation-search"
CAVP_DETAIL = BASE + "/projects/cryptographic-algorithm-validation-program/details?validation={}"
CAVP_CAPS = BASE + "/csrcservices/public/cavp/RESTApi/ValidationOEAlgorithm/{}"
UA = "cmvpvalidations (+https://github.com/regenscheid/cmvpvalidations)"

# CAVP algorithm ids (from the validation-search form) per family and operation.
FAMILIES = {
    "ML-DSA": {"176": "KeyGen", "177": "SigGen", "178": "SigVer"},
    "ML-KEM": {"179": "EncapDecap", "180": "KeyGen"},
}
TEXT_MENTION = {"ML-DSA": r"ML-DSA|FIPS\s*204|Dilithium", "ML-KEM": r"ML-KEM|FIPS\s*203|Kyber"}
slug = lambda fam: fam.lower().replace("-", "_")


def fetch(url, cache_file, refresh=False, retries=4):
    if cache_file.exists() and not refresh:
        return cache_file.read_text(encoding="utf-8", errors="replace")
    last = None
    for attempt in range(retries):
        try:
            # csrc.nist.gov resets connections from Python's urllib (TLS fingerprint), so shell out to curl.
            p = subprocess.run(["curl", "-sS", "--fail", "-m", "60", "-A", UA, url],
                               capture_output=True, timeout=90)
            if p.returncode != 0:
                raise RuntimeError(p.stderr.decode("utf-8", "replace").strip() or f"curl exit {p.returncode}")
            body = p.stdout.decode("utf-8", errors="replace")
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(body, encoding="utf-8")
            return body
        except Exception as e:  # noqa: BLE001 - retry on any transport error
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed to fetch {url}: {last}")


def text(fragment):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fragment, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _mdy(s):
    m, d, y = (int(x) for x in s.split("/"))
    return (y, m, d)


# ---------------------------------------------------------------- CMVP ----
def list_certs(standard, status, cache, refresh):
    params = {"SearchMode": "Advanced", "Standard": standard, "CertificateStatus": status, "ValidationYear": "0"}
    page = fetch(CMVP_SEARCH + "?" + urllib.parse.urlencode(params),
                 cache / f"list_{standard}_{status or 'any'}.html", refresh)
    certs = sorted({int(c) for c in re.findall(r"certificate/(\d+)\"", page)})
    if not certs:
        sys.exit("no certificates found; the CMVP search page layout may have changed")
    return certs


def parse_cert(num, page):
    chunks = re.split(r'<div class="row padrow">', page)[1:]
    fields = {}
    for ch in chunks:
        m = re.match(r'\s*<div class="col-md-3">(.*?)</div>', ch, re.S)
        if m:
            fields[text(m.group(1))] = ch[m.end():]
    approved = []
    for row in re.finditer(
        r'<div class="col-md-3">([^<]+)</div>\s*<div class="col-md-4">\s*(?:<a href="[^"]*validation=(\d+)">([^<]+)</a>|([^<]*))',
        fields.get("Approved Algorithms", ""),
    ):
        approved.append({"algorithm": html.unescape(row.group(1)).strip(),
                         "cavp_cert": (row.group(3) or row.group(4) or "").strip(),
                         "cavp_id": row.group(2) or ""})
    vendor = re.search(r'<h4 class="panel-title">Vendor</h4>.*?<a [^>]*>(.*?)</a>', page, re.S)
    history = re.search(r'id="validation-history-table".*?</table>', page, re.S)
    dates, labs = [], []
    if history:
        for tr in re.findall(r"<tr>(.*?)</tr>", history.group(0), re.S):
            tds = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(tds) >= 3:
                dates.append(tds[0]); labs.append(tds[2])
    sp = re.search(r'href="([^"]*140sp\d+\.pdf)"', page)
    other = {k: text(fields.get(k, "")) for k in ("Allowed Algorithms", "Non-Approved Algorithms")}
    return {
        "cert": num,
        "vendor": text(vendor.group(1)) if vendor else "",
        "module": text(fields.get("Module Name", "")),
        "standard": text(fields.get("Standard", "")),
        "status": text(fields.get("Status", "")),
        "sunset": text(fields.get("Sunset Date", "")),
        "level": text(fields.get("Overall Level", "")),
        "type": text(fields.get("Module Type", "")),
        "embodiment": text(fields.get("Embodiment", "")),
        "first_validated": min(dates, key=_mdy) if dates else "",
        "last_updated": max(dates, key=_mdy) if dates else "",
        "labs": "; ".join(sorted(set(labs))),
        "security_policy": BASE + urllib.parse.quote(sp.group(1)) if sp else "",
        "url": CMVP_CERT.format(num),
        "approved": approved,
        "other_text": " ".join(other.values()),
    }


# ---------------------------------------------------------------- CAVP ----
def cavp_list(cache, refresh):
    """All CAVP validations per family/operation. A multi-algorithm query is an AND, so query each
    operation separately (all result pages) and take the union."""
    out = {}
    for fam, ops in FAMILIES.items():
        per_op, union = {}, {}
        for alg_id, op in ops.items():
            rows, pg, pages = [], 1, 1
            while pg <= pages:
                q = ("searchMode=validation&family=&validationNumber=&vendor=&product=&productType=-1"
                     f"&algorithm={alg_id}&dateFrom=&dateTo=&ipp=250" + (f"&page={pg}" if pg > 1 else ""))
                name = f"cavp_list_{alg_id}" + (f"_p{pg}" if pg > 1 else "") + ".html"
                page = fetch(f"{CAVP_SEARCH}?{q}", cache / name, refresh)
                m = re.search(r"data-total-pages='(\d+)'", page)
                pages = int(m.group(1)) if m else 1
                for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
                    d = re.search(r"details\?validation=(\d+)", tr)
                    tds = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
                    if d and len(tds) >= 4:
                        rows.append({"cavp_id": d.group(1), "vendor": tds[0], "implementation": tds[1],
                                     "cavp_cert": tds[2], "date": tds[3]})
                pg += 1
            total = re.search(r"data-total-results='(\d+)'", page)
            if total and int(total.group(1)) != len(rows):
                print(f"warning: CAVP {fam} {op}: page says {total.group(1)} rows, parsed {len(rows)}", file=sys.stderr)
            per_op[op] = rows
            for r in rows:
                union.setdefault(r["cavp_cert"], r)
        out[fam] = {"ops": per_op, "any": union}
    return out


def cavp_caps(cavp_id, cache, refresh):
    """ML-DSA / ML-KEM capabilities of one CAVP validation (the page loads them lazily per row)."""
    page = fetch(CAVP_DETAIL.format(cavp_id), cache / "cavp" / f"{cavp_id}.html", refresh)
    caps = []
    for fam, op, cap_id in re.findall(r'Validation-Notes#(ML-DSA|ML-KEM) (\w+)">.*?ShowCaps\((\d+)\)', page, re.S):
        body = fetch(CAVP_CAPS.format(cap_id), cache / "caps" / f"{cap_id}.json", refresh)
        t = text(json.loads(body))
        sets = re.search(r"Parameter Sets?:\s*(.*?)(?=\s+(?:Message|Context|Seed|Pre|Determ|External|Signature|Functions)\b|$)", t)
        funcs = re.search(r"Functions:\s*(.*)$", t)
        caps.append({
            "family": fam, "op": op,
            "parameter_sets": sorted(set(re.findall(r"ML-(?:DSA|KEM)-\d+", sets.group(1) if sets else t))),
            "interfaces": (re.search(r"Signature Interfaces:\s*([a-z, ]+?)(?=\s+[A-Z])", t) or [None, ""])[1].strip(),
            "prehash": (re.search(r"Pre Hash:\s*([A-Za-z, ]+?)(?=\s+[A-Z][a-z]+ ?[A-Za-z]*:|$)", t) or [None, ""])[1].strip(),
            "functions": funcs.group(1).strip() if funcs else "",
        })
    return caps


def cavp_oes(cache, cavp_id, fam):
    """Operational environments listed beside the family's operations on a CAVP validation page."""
    page = (cache / "cavp" / f"{cavp_id}.html").read_text(encoding="utf-8", errors="replace")
    oes = []
    for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
        if re.search(rf"Validation-Notes#{fam}\b", tr):
            first = re.search(r"<td>(.*?)<a ", tr, re.S)
            if first and text(first.group(1)) not in oes:
                oes.append(text(first.group(1)))
    return oes


def split_csv(items):
    return sorted({x.strip() for s in items for x in s.split(",") if x.strip()})


# ----------------------------------------------------------------- MIP ----
def parse_mip(cache, refresh):
    page = fetch(CMVP_MIP, cache / "mip.html", refresh)
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 4:
            continue
        raw = text(tds[3])
        m = re.match(r"(.*?)\s*\((\d+/\d+/\d+)\)\s*$", raw)
        rows.append({"module": text(tds[0]), "vendor": text(re.sub(r"<a .*", "", tds[1], flags=re.S)),
                     "standard": text(tds[2]), "status": (m.group(1) if m else raw), "status_date": m.group(2) if m else ""})
    if not rows:
        print("warning: no rows parsed from the Modules In Process list", file=sys.stderr)
    return rows


_VENDOR_NOISE = {"inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "gmbh", "ag", "sa", "plc",
                 "lp", "the", "pty", "pte", "srl", "bv", "kk", "incorporated"}


def norm_vendor(s):
    toks = [t for t in re.sub(r"[^a-z0-9]+", " ", s.lower()).split() if t not in _VENDOR_NOISE]
    return " ".join(toks)


def vendor_match(a, b):
    a, b = norm_vendor(a), norm_vendor(b)
    if not a or not b:
        return False
    return a == b or a.startswith(b + " ") or b.startswith(a + " ")


def norm_name(s):
    return " ".join(re.sub(r"[^a-z0-9.]+", " ", s.lower()).split())


def name_match(a, b):
    a, b = norm_name(a), norm_name(b)
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return len(short.split()) >= 3 and f" {short} " in f" {long_} "


def in_process(mip, gap_rows):
    """Match unattached CAVP validations to Modules In Process, by vendor and (strongly) by module name."""
    mip = [m for m in mip if "140-3" in m["standard"]]
    groups = {}
    for m in mip:
        groups.setdefault((norm_vendor(m["vendor"]), m["module"]), {"vendor": m["vendor"], "module": m["module"],
                                                                      "statuses": []})["statuses"].append(
            {"status": m["status"], "date": m["status_date"]})
    likely, vendor_only = [], {}
    for g in groups.values():
        same = [r for r in gap_rows if vendor_match(r["vendor"], g["vendor"])]
        if not same:
            continue
        hits = [r for r in same if name_match(r["implementation"], g["module"])]
        if hits:
            likely.append({**g, "cavp": [{k: r[k] for k in ("family", "cavp_cert", "implementation", "date", "url")}
                                         for r in hits]})
        else:
            v = vendor_only.setdefault(norm_vendor(g["vendor"]), {"vendor": g["vendor"], "modules": [], "cavp": {}})
            v["modules"].append({"module": g["module"], "statuses": g["statuses"]})
            for r in same:
                v["cavp"].setdefault(r["family"], set()).add(r["cavp_cert"])
    vo = [{"vendor": v["vendor"], "modules": sorted(v["modules"], key=lambda x: x["module"]),
           "cavp": {f: sorted(c) for f, c in v["cavp"].items()}} for v in vendor_only.values()]
    return {"likely": sorted(likely, key=lambda x: (x["vendor"].lower(), x["module"])),
            "vendor_only": sorted(vo, key=lambda x: x["vendor"].lower())}


# ---------------------------------------------------------------- main ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--standard", default="140-3")
    ap.add_argument("--status", default="Active", help="Active, Historical, Revoked, or '' for all")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="debug: only the newest N certificates")
    a = ap.parse_args()
    out, cache = Path(a.out), Path(a.cache)
    out.mkdir(parents=True, exist_ok=True)

    certs = list_certs(a.standard, a.status, cache, a.refresh)
    if a.limit:
        certs = certs[-a.limit:]
    print(f"CMVP: {len(certs)} certificates (FIPS {a.standard}, status={a.status or 'any'})")

    def one(n):
        time.sleep(0.15)
        return parse_cert(n, fetch(CMVP_CERT.format(n), cache / "cert" / f"{n}.html", a.refresh))

    with ThreadPoolExecutor(a.workers) as ex:
        modules = list(ex.map(one, certs))

    hits, text_only = [], {f: [] for f in FAMILIES}
    for m in modules:
        m["pqc"] = {f: [e for e in m["approved"] if e["algorithm"].upper().startswith(f)] for f in FAMILIES}
        if any(m["pqc"].values()):
            hits.append(m)
        for f in FAMILIES:
            if not m["pqc"][f] and re.search(TEXT_MENTION[f], m["other_text"], re.I):
                text_only[f].append(m)
    for f in FAMILIES:
        print(f"{f}: {sum(1 for m in hits if m['pqc'][f])} modules list it as approved; "
              f"{len(text_only[f])} mention it only in allowed/non-approved text")

    cavp = cavp_list(cache, a.refresh)
    gap = []
    for f in FAMILIES:
        used = {e["cavp_cert"] for m in hits for e in m["pqc"][f]}
        unknown = sorted(c for c in used if c not in cavp[f]["any"])
        if unknown:
            print(f"note: {len(unknown)} module-referenced {f} certs not in the CAVP {f} list: {unknown}", file=sys.stderr)
        for cert, r in cavp[f]["any"].items():
            if cert not in used:
                gap.append({"family": f, "cavp_cert": cert, "cavp_id": r["cavp_id"], "vendor": r["vendor"],
                            "implementation": r["implementation"], "date": r["date"],
                            "ops": [op for op, rows in cavp[f]["ops"].items() if any(x["cavp_cert"] == cert for x in rows)],
                            "url": CAVP_DETAIL.format(r["cavp_id"])})
        print(f"CAVP {f}: {len(cavp[f]['any'])} validations; "
              f"{sum(1 for g in gap if g['family'] == f)} not referenced by a scanned module")

    ids = sorted({e["cavp_id"] for m in hits for f in FAMILIES for e in m["pqc"][f] if e["cavp_id"]})

    def det(i):
        time.sleep(0.15)
        return i, cavp_caps(i, cache, a.refresh)

    with ThreadPoolExecutor(a.workers) as ex:
        caps_by_id = dict(ex.map(det, ids))

    rows = []
    for m in hits:
        row = {"cmvp_cert": m["cert"], "vendor": m["vendor"], "module": m["module"], "type": m["type"],
               "embodiment": m["embodiment"], "level": m["level"], "status": m["status"],
               "first_validated": m["first_validated"], "last_updated": m["last_updated"], "sunset": m["sunset"],
               "families": ", ".join(f for f in FAMILIES if m["pqc"][f])}
        detail = {}
        for f in FAMILIES:
            by_cert = {}
            for e in m["pqc"][f]:
                by_cert.setdefault(e["cavp_cert"], {"ops": set(), "id": e["cavp_id"]})["ops"].add(
                    e["algorithm"][len(f):].strip())
            detail[f] = []
            for c, v in sorted(by_cert.items()):
                fc = [x for x in caps_by_id.get(v["id"], []) if x["family"] == f]
                detail[f].append({
                    "cavp_cert": c, "cavp_id": v["id"], "url": CAVP_DETAIL.format(v["id"]), "ops": sorted(v["ops"]),
                    "parameter_sets": sorted({p for x in fc for p in x["parameter_sets"]}),
                    "interfaces": split_csv(x["interfaces"] for x in fc),
                    "prehash": split_csv(x["prehash"] for x in fc),
                    "functions": split_csv(x["functions"] for x in fc),
                    "operating_environments": cavp_oes(cache, v["id"], f) if v["id"] else []})
            s = slug(f)
            row[f"{s}_operations"] = "/".join(sorted({o for d in detail[f] for o in d["ops"]}))
            row[f"{s}_cavp_certs"] = "; ".join(d["cavp_cert"] for d in detail[f])
            row[f"{s}_parameter_sets"] = "; ".join(
                f"{d['cavp_cert']}: {','.join(p.replace(f + '-', '') for p in d['parameter_sets']) or '?'}" for d in detail[f])
        row["security_policy"] = m["security_policy"]
        row["url"] = m["url"]
        row["cavp_detail"] = detail
        rows.append(row)
    rows.sort(key=lambda r: r["cmvp_cert"], reverse=True)

    mip = parse_mip(cache, a.refresh)
    inproc = in_process(mip, gap)
    print(f"MIP: {len(mip)} entries; {len(inproc['likely'])} likely matches, "
          f"{len(inproc['vendor_only'])} vendors with other modules in process")

    cols = [k for k in (rows[0].keys() if rows else ["none"]) if k != "cavp_detail"]
    with open(out / "fips140-3_pqc_modules.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader(); w.writerows({k: r[k] for k in cols} for r in rows)
    gcols = ["family", "cavp_cert", "vendor", "implementation", "date", "ops", "cavp_id"]
    with open(out / "cavp_pqc_without_module.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(gcols)
        for g in sorted(gap, key=lambda g: (g["family"], g["cavp_cert"])):
            w.writerow([("/".join(g[c]) if c == "ops" else g[c]) for c in gcols])
    with open(out / "mip_pqc_candidates.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["match", "vendor", "module_in_process", "mip_status", "cavp_family", "cavp_certs"])
        for x in inproc["likely"]:
            for fam in sorted({c["family"] for c in x["cavp"]}):
                w.writerow(["module name matches", x["vendor"], x["module"],
                            "; ".join(f"{s['status']} ({s['date']})" for s in x["statuses"]), fam,
                            "; ".join(c["cavp_cert"] for c in x["cavp"] if c["family"] == fam)])
        for v in inproc["vendor_only"]:
            for mod in v["modules"]:
                for fam, certs in v["cavp"].items():
                    w.writerow(["same vendor only", v["vendor"], mod["module"],
                                "; ".join(f"{s['status']} ({s['date']})" for s in mod["statuses"]), fam, "; ".join(certs)])
    with open(out / "fips140-3_pqc_modules.json", "w") as f:
        json.dump({"generated": time.strftime("%Y-%m-%d"), "standard": a.standard, "status": a.status,
                   "modules_scanned": len(modules), "families": list(FAMILIES), "modules": rows,
                   "text_mentions_only": {fam: [{"cert": m["cert"], "vendor": m["vendor"], "module": m["module"],
                                                 "url": m["url"]} for m in ms] for fam, ms in text_only.items()},
                   "cavp_counts": {fam: len(cavp[fam]["any"]) for fam in FAMILIES},
                   "cavp_without_module": gap,
                   "mip_total": len(mip), "in_process": inproc}, f, indent=2)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
