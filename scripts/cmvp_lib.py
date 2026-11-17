"""Shared fetching and parsing for the NIST CSRC CMVP pages.

Used by cmvp_crawl.py (full certificate dataset) and cmvp_pqc.py (ML-DSA / ML-KEM survey).
Only the standard library and curl are needed.
"""
import html, json, re, subprocess, sys, time, urllib.parse

BASE = "https://csrc.nist.gov"
CMVP = BASE + "/projects/cryptographic-module-validation-program"
CMVP_SEARCH = CMVP + "/validated-modules/search"
CMVP_CERT = CMVP + "/certificate/{}"
CMVP_MIP = CMVP + "/modules-in-process/modules-in-process-list"
CAVP_SEARCH = BASE + "/projects/cryptographic-algorithm-validation-program/validation-search"
CAVP_DETAIL = BASE + "/projects/cryptographic-algorithm-validation-program/details?validation={}"
CAVP_CAPS = BASE + "/csrcservices/public/cavp/RESTApi/ValidationOEAlgorithm/{}"
UA = "cmvpvalidations (+https://github.com/regenscheid/cmvpvalidations)"
STATUSES = ("Active", "Historical", "Revoked")


def fetch(url, cache_file, refresh=False, retries=4, check=None):
    """Return the page body, from cache_file when present. `check(body)` may reject a body
    (e.g. a truncated page); rejected bodies are retried and never cached."""
    if cache_file.exists() and not refresh:
        return cache_file.read_text(encoding="utf-8", errors="replace")
    last = None
    for attempt in range(retries):
        try:
            # csrc.nist.gov resets connections from Python's urllib (TLS fingerprint), so shell out to curl.
            p = subprocess.run(["curl", "-sS", "--fail", "-m", "90", "-A", UA, url],
                               capture_output=True, timeout=120)
            if p.returncode != 0:
                raise RuntimeError(p.stderr.decode("utf-8", "replace").strip() or f"curl exit {p.returncode}")
            body = p.stdout.decode("utf-8", errors="replace")
            if check and not check(body):
                raise RuntimeError("page failed its completeness check")
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(body, encoding="utf-8")
            return body
        except Exception as e:  # noqa: BLE001 - retry on any transport error
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"failed to fetch {url}: {last}")


def text(fragment):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fragment, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def mdy(s):
    m, d, y = (int(x) for x in s.split("/"))
    return (y, m, d)


def iso(s):
    try:
        y, m, d = mdy(s)
        return f"{y:04d}-{m:02d}-{d:02d}"
    except (ValueError, AttributeError):
        return ""


def cf_email(hexstr):
    """Decode a Cloudflare-obfuscated address (data-cfemail): first byte is the XOR key."""
    try:
        b = bytes.fromhex(hexstr)
        return bytes(x ^ b[0] for x in b[1:]).decode("utf-8", "replace")
    except ValueError:
        return ""


# ------------------------------------------------------------ search list ----
def list_certs(standard, status, cache, refresh=False):
    """Rows of the CMVP validated-modules search for one standard and status.
    An empty status means Active on the CSRC site, so callers pass each status explicitly."""
    params = {"SearchMode": "Advanced", "Standard": standard, "CertificateStatus": status, "ValidationYear": "0"}
    page = fetch(CMVP_SEARCH + "?" + urllib.parse.urlencode(params),
                 cache / f"list_{standard}_{status or 'any'}.html", refresh)
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        num = re.search(r'certificate/(\d+)"', tr)
        tds = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if num and len(tds) >= 6:
            rows.append({"cert": int(num.group(1)), "vendor": tds[1], "module": tds[2], "type": tds[3],
                         "validation_dates": tds[4].split(), "status": tds[5]})
    total = re.search(r'data-total-records="(\d+)"', page)
    if total and int(total.group(1)) != len(rows):
        print(f"warning: CMVP {standard} {status}: page says {total.group(1)} rows, parsed {len(rows)}", file=sys.stderr)
    return rows


# ------------------------------------------------------- certificate page ----
LIST_FIELDS = {"Security Level Exceptions", "Tested Configuration(s)"}
KNOWN = {  # page label -> record key
    "Module Name": "module", "Standard": "standard", "Status": "status", "Sunset Date": "sunset",
    "Overall Level": "level", "Caveat": "caveat", "Security Level Exceptions": "level_exceptions",
    "Module Type": "type", "Embodiment": "embodiment", "Description": "description",
    "Tested Configuration(s)": "tested_configurations", "Allowed Algorithms": "allowed_algorithms",
    "Non-Approved Algorithms": "non_approved_algorithms", "Entropy": "entropy",
    "Software Versions": "software_versions", "Hardware Versions": "hardware_versions",
    "Firmware Versions": "firmware_versions", "PIV Cert Number": "piv_cert", "Product URL": "product_url",
}


def cert_page_ok(page):
    """A full certificate page has the Details panel and the validation history table."""
    return 'panel-title">Details' in page and "validation-history-table" in page and "</html>" in page


def _panel(page, title):
    m = re.search(rf'<h4 class="panel-title">{re.escape(title)}</h4>\s*</div>\s*<div class="panel-body">(.*?)'
                  r'(?=<div class="panel panel-default">|<div id="footer-pusher">)', page, re.S)
    return m.group(1) if m else ""


def _details_fields(page):
    """label -> raw HTML value for each row of the Details panel (both `row padrow` and plain `row`)."""
    body = _panel(page, "Details")
    fields = {}
    # Field rows are `row padrow`, or a plain `row` whose label is in a <span> (Product URL). Approved
    # algorithm entries are nested plain rows without a span, so they stay inside their field.
    start = r'<div class="row padrow">\s*<div class="col-md-3">|<div class="row">\s*<div class="col-md-3">(?=\s*<span>)'
    for m in re.finditer(rf'(?:{start})(.*?)</div>\s*<div class="col-md-9"[^>]*>', body, re.S):
        label = text(m.group(1))
        if not label or label in fields:
            continue
        # value runs until the next Details row label
        nxt = re.search(start, body[m.end():])
        fields[label] = body[m.end(): m.end() + nxt.start()] if nxt else body[m.end():]
    return fields


def _approved(fragment):
    out = []
    for row in re.finditer(
        r'<div class="col-md-3">([^<]+)</div>\s*<div class="col-md-4">\s*'
        r'(?:<a href="[^"]*validation=(\d+)">([^<]+)</a>|([^<]*))', fragment):
        out.append({"algorithm": html.unescape(row.group(1)).strip(),
                    "cavp_cert": (row.group(3) or row.group(4) or "").strip(),
                    "cavp_id": row.group(2) or ""})
    return out


def _vendor(page):
    body = _panel(page, "Vendor")
    name = re.search(r"<a [^>]*href=\"([^\"]*)\"[^>]*>(.*?)</a>", body, re.S)
    head, _, contacts_html = body.partition('<div style="font-size: 0.9em;">')
    address = [text(a) for a in re.findall(r'<span class="indent">(.*?)</span>', head, re.S)]
    contacts = []
    for block in re.findall(r"<span>\s*(.*?)</span>\s*(?=<span>|</div>)", contacts_html, re.S):
        parts = re.split(r"<br\s*/?>", block)
        # Emails are Cloudflare-obfuscated on CSRC; they are deliberately not decoded into a public dataset.
        c = {"name": text(parts[0]), "phone": "", "fax": ""}
        for p in parts[1:]:
            t = text(p)
            if "data-cfemail" in p:
                continue
            if t.lower().startswith("phone"):
                c["phone"] = t.split(":", 1)[-1].strip()
            elif t.lower().startswith("fax"):
                c["fax"] = t.split(":", 1)[-1].strip()
        if any(c.values()):
            contacts.append(c)
    return {"name": text(name.group(2)) if name else text(head.split("<br")[0]),
            "website": name.group(1) if name else "", "address": address, "contacts": contacts}


def _files(page):
    return [{"label": text(lbl), "url": BASE + urllib.parse.quote(href) if href.startswith("/") else href}
            for href, lbl in re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', _panel(page, "Related Files"), re.S)]


def _history(page):
    hist = re.search(r'id="validation-history-table".*?</table>', page, re.S)
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", hist.group(0) if hist else "", re.S):
        tds = [text(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) >= 3:
            rows.append({"date": tds[0], "type": tds[1], "lab": tds[2]})
    return rows


def cert_record_key(rec):
    """What the search list shows for a certificate; a change means the page should be refetched."""
    return (rec.get("status", ""), sorted(rec.get("validation_dates", [])))


def parse_cert(num, page):
    fields = _details_fields(page)
    rec = {"cert": num, "url": CMVP_CERT.format(num)}
    other = {}
    for label, raw in fields.items():
        if label == "Approved Algorithms":
            continue
        key = KNOWN.get(label)
        if label in LIST_FIELDS:
            val = [text(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", raw, re.S)] or ([text(raw)] if text(raw) else [])
        elif label == "Product URL":
            href = re.search(r'href="([^"]+)"', raw)
            val = href.group(1) if href else text(raw)
        else:
            val = text(raw)
        if key:
            rec[key] = val
        else:
            other[label] = val
    for k in KNOWN.values():
        rec.setdefault(k, [] if k in ("level_exceptions", "tested_configurations") else "")
    rec["standard"] = rec["standard"].replace("FIPS ", "")
    rec["approved"] = _approved(fields.get("Approved Algorithms", ""))
    v = _vendor(page)
    rec["vendor"] = v["name"]
    rec["vendor_info"] = v
    rec["files"] = _files(page)
    rec["history"] = _history(page)
    dates = [h["date"] for h in rec["history"] if re.fullmatch(r"\d+/\d+/\d+", h["date"])]
    rec["first_validated"] = min(dates, key=mdy) if dates else ""
    rec["last_updated"] = max(dates, key=mdy) if dates else ""
    rec["labs"] = "; ".join(sorted({h["lab"] for h in rec["history"] if h["lab"]}))
    sp = next((f["url"] for f in rec["files"] if f["label"].lower() == "security policy"), "")
    rec["security_policy"] = sp
    rec["other_fields"] = other
    rec["other_text"] = " ".join([rec["allowed_algorithms"], rec["non_approved_algorithms"]]).strip()
    # A few CSRC pages render only part of the Details panel (no module name, vendor or history).
    rec["sparse"] = not (rec["module"] and rec["vendor"] and rec["history"])
    return rec


# ------------------------------------------------------ CAVP validation ----
CAVP_EXPANDED = CAVP_DETAIL + "&displayMode=ExpandedAlgorithm"


def cavp_page_ok(page):
    return "publications-table" in page and 'id="product-name"' in page


def _li_lines(fragment):
    """Nested <ul><li> lists as indented lines ("  " per level), text only."""
    from html.parser import HTMLParser

    class P(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.depth, self.lines, self.buf = 0, [], None

        def flush(self):
            if self.buf is not None:
                t = re.sub(r"\s+", " ", "".join(self.buf)).strip()
                if t:
                    self.lines.append("  " * max(self.depth - 1, 0) + t)
            self.buf = None

        def handle_starttag(self, tag, attrs):
            if tag == "ul":
                self.flush(); self.depth += 1
            elif tag == "li":
                self.flush(); self.buf = []

        def handle_endtag(self, tag):
            if tag == "ul":
                self.flush(); self.depth -= 1
            elif tag == "li":
                self.flush()

        def handle_data(self, data):
            if self.buf is not None:
                self.buf.append(data)

    p = P(); p.feed(fragment); p.flush()
    return p.lines


def _cavp_field(page, label):
    m = re.search(rf'<div class="col-md-2">{re.escape(label)}</div>\s*<div class="col-md-10"[^>]*>(.*?)</div>', page, re.S)
    return m.group(1) if m else ""


def parse_cavp(cavp_id, page):
    """One CAVP validation (expanded view): implementation, vendor, and per-OE algorithm capabilities."""
    name = re.search(r'<a href="details\?product=(\d+)" id="product-name">(.*?)</a>', page, re.S)
    cert = re.search(r'<h4 style="display: inline-block">\s*<a href="details\?validation=\d+">([^<]+)</a>', page)
    first = re.search(r"First Validated:\s*([\d/]+)", page)
    vend = re.search(r'<div class="col-md-1">Vendor</div>\s*<div class="col-md-5">(.*?)</div>', page, re.S)
    vhtml = vend.group(1) if vend else ""
    vlink = re.search(r'<a href="([^"]*)">(.*?)</a>', vhtml, re.S)
    table = re.search(r'<table class="table table-condensed table-bordered publications-table">.*?<tbody>(.*?)</tbody>',
                      page, re.S)
    oes, oe_idx, algos = [], {}, []
    for tr in re.findall(r"<tr>(.*?)</tr>", table.group(1) if table else "", re.S):
        tds = re.findall(r"<td>(.*?)</td>", tr, re.S)
        if len(tds) < 2:
            continue
        oe_name = text(re.split(r"<ul|<a ", tds[0], maxsplit=1)[0])
        details = _li_lines(tds[0])
        key = (oe_name, tuple(details))
        if key not in oe_idx:
            oe_idx[key] = len(oes)
            oes.append({"name": oe_name, "details": details})
        alg = re.search(r'<a href="Validation-Notes#([^"]*)">\s*<b>(.*?)</b>', tds[1], re.S)
        caps = re.search(r'<ul class="list[^"]*">.*</ul>', tds[1], re.S)
        entry = {"algorithm": text(alg.group(2)) if alg else text(tds[1])[:80],
                 "oe": oe_idx[key], "capabilities": _li_lines(caps.group(0)) if caps else []}
        cap_id = re.search(r"ShowCaps\((\d+)\)", tds[1])
        if cap_id and not caps:  # collapsed view: capabilities load per row from the REST API
            entry["cap_id"] = cap_id.group(1)
        algos.append(entry)
    return {
        "cavp_id": str(cavp_id),
        "cavp_cert": cert.group(1).strip() if cert else "",
        "url": CAVP_DETAIL.format(cavp_id),
        "implementation": text(name.group(2)) if name else "",
        "product_id": name.group(1) if name else "",
        "description": text(_cavp_field(page, "Description")),
        "version": text(_cavp_field(page, "Version")),
        "type": text(_cavp_field(page, "Type")),
        "first_validated": first.group(1) if first else "",
        "vendor": text(vlink.group(2)) if vlink else text(vhtml.split("<br")[0]),
        "vendor_website": vlink.group(1) if vlink else "",
        "oes": oes,
        "algorithms": algos,
    }


def parse_cavp_collapsed(cavp_id, page, get_caps):
    """Fallback for validations whose expanded view times out on CSRC: parse the default view and
    fill each algorithm's capabilities from the per-row REST endpoint (`get_caps(cap_id)` -> JSON
    body). OE details are not available this way."""
    rec = parse_cavp(cavp_id, page)
    for a in rec["algorithms"]:
        cap_id = a.pop("cap_id", None)
        if cap_id:
            a["capabilities"] = _li_lines(json.loads(get_caps(cap_id)))
    rec["partial"] = "collapsed view; operating-environment details unavailable"
    return rec
