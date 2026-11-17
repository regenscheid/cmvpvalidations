#!/usr/bin/env python3
"""Build static HTML reports from the JSON written by cmvp_pqc.py.

Usage: python3 -I make_reports.py --data out/fips140-3_pqc_modules.json --out reports
Writes index.html, cavp-gap.html, in-process.html and module-<cert>.html.
Pages are self-contained (inline CSS/JS).
"""
import argparse, html, json
from collections import Counter
from pathlib import Path

CMVP_BASE = "https://csrc.nist.gov/projects/cryptographic-module-validation-program"
CAVP_SEARCH = "https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/validation-search"
FIPS = {"ML-DSA": "FIPS 204", "ML-KEM": "FIPS 203"}
slug = lambda f: f.lower().replace("-", "_")

CSS = """
:root{--bg:#fafaf8;--surface:#fff;--ink:#1d2328;--muted:#5d6872;--line:#dfe3e6;--accent:#1d5fa8;--accent-soft:#e6eff9;
--ok:#1f7a4d;--ok-soft:#e3f3ea;--kem:#7a3d91;--kem-soft:#f1e8f6;--warn:#8a5a00;--warn-soft:#fbf0d9;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181c;--surface:#1c2227;--ink:#e6eaed;--muted:#9aa5ad;
--line:#2d363d;--accent:#7db3ee;--accent-soft:#1f3347;--ok:#6fd0a0;--ok-soft:#1b3328;--kem:#d6a4ea;--kem-soft:#34243d;--warn:#e6b862;--warn-soft:#3a2f17}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:1.7rem;line-height:1.2;margin:.2em 0 .3em}
h2{font-size:1.2rem;margin:2em 0 .6em}
h3{font-size:1.02rem;margin:1.4em 0 .5em}
p{margin:.5em 0}
a{color:var(--accent)}
.sub{color:var(--muted);margin:0 0 1.2em}
nav.crumbs{font-size:.9rem;color:var(--muted)}
nav.crumbs a{color:var(--muted)}
nav.top{display:flex;gap:16px;flex-wrap:wrap;font-size:.92rem;margin:0 0 6px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:1.2em 0}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat b{display:block;font-size:1.9rem;line-height:1.1}
.stat span{color:var(--muted);font-size:.9rem}
.wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:.93rem}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-weight:600;color:var(--muted);font-size:.82rem;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
th[data-sort]{cursor:pointer}
th[data-sort]:hover{color:var(--ink)}
th[aria-sort="ascending"]::after{content:" \\25B2";font-size:.7em}
th[aria-sort="descending"]::after{content:" \\25BC";font-size:.7em}
.mono,.num{font-family:var(--mono);font-size:.88em}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;background:var(--accent-soft);color:var(--accent);margin:1px 3px 1px 0;white-space:nowrap}
.tag.ok{background:var(--ok-soft);color:var(--ok)}
.tag.dsa{background:var(--accent-soft);color:var(--accent)}
.tag.kem{background:var(--kem-soft);color:var(--kem)}
.note{background:var(--warn-soft);color:var(--ink);border-left:4px solid var(--warn);padding:10px 14px;border-radius:6px;margin:1em 0;font-size:.95rem}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:0}
dl.kv dt{color:var(--muted)}
dl.kv dd{margin:0}
.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 10px}
input[type=search]{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;min-width:260px;max-width:100%}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.chip{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:3px 11px;font:inherit;font-size:.85rem;cursor:pointer}
.chip:hover{border-color:var(--accent)}
.chip.active{background:var(--accent);border-color:var(--accent);color:var(--surface)}
details{margin:2px 0}
summary{cursor:pointer;color:var(--accent)}
.muted{color:var(--muted)}
footer{margin-top:3em;color:var(--muted);font-size:.85rem}
@media (max-width:600px){dl.kv{grid-template-columns:1fr}dl.kv dt{margin-top:6px}}
"""

# Shared filter script: text box + family chips (+ optional vendor chips) over a table, and column sorting.
JS = """
(function(){
 var t=document.getElementById('t'),tb=t.tBodies[0],q=document.getElementById('q'),c=document.getElementById('count'),fam='all';
 function cell(r,i){var td=r.cells[i];return (td.getAttribute('data-sort')||td.textContent).trim().toLowerCase();}
 function filter(){var s=q.value.trim().toLowerCase(),n=0;
  [].forEach.call(tb.rows,function(r){var m=(fam==='all'||r.getAttribute('data-fam').split(' ').indexOf(fam)>-1)&&(!s||r.textContent.toLowerCase().indexOf(s)>-1);r.hidden=!m;if(m)n++;});
  c.textContent=n+' of '+tb.rows.length+' shown';}
 q.addEventListener('input',filter);
 [].forEach.call(document.querySelectorAll('[data-fam-chip]'),function(b){b.addEventListener('click',function(){
  fam=b.getAttribute('data-fam-chip');
  [].forEach.call(document.querySelectorAll('[data-fam-chip]'),function(o){o.classList.toggle('active',o===b);});filter();});});
 [].forEach.call(document.querySelectorAll('[data-v]'),function(b){b.addEventListener('click',function(){q.value=b.getAttribute('data-v');filter();});});
 [].forEach.call(t.tHead.rows[0].cells,function(th,i){
  if(!th.hasAttribute('data-sort'))return;
  th.addEventListener('click',function(){
   var asc=th.getAttribute('aria-sort')!=='ascending';
   [].forEach.call(t.tHead.rows[0].cells,function(o){o.removeAttribute('aria-sort');});
   th.setAttribute('aria-sort',asc?'ascending':'descending');
   var rows=[].slice.call(tb.rows).sort(function(a,b){var x=cell(a,i),y=cell(b,i);return (x<y?-1:x>y?1:0)*(asc?1:-1);});
   rows.forEach(function(r){tb.appendChild(r);});
  });
 });
 filter();
})();
"""


def e(x):
    return html.escape(str(x), quote=True)


def link(url, label):
    return f'<a href="{e(url)}" target="_blank" rel="noopener noreferrer">{e(label)}</a>'


def iso(mdy):
    try:
        m, d, y = (int(p) for p in mdy.split("/"))
        return f"{y:04d}-{m:02d}-{d:02d}"
    except ValueError:
        return ""


def page(title, body, desc="", script=""):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}">
<style>{CSS}</style></head>
<body><main>
{body}
</main>{('<script>' + script + '</script>') if script else ''}</body></html>
"""


def top_nav(cur):
    items = [("index.html", "Validated modules"), ("in-process.html", "In process"), ("cavp-gap.html", "Algorithm tests without a module")]
    return '<nav class="top">' + " &middot; ".join(
        (f"<b>{e(l)}</b>" if h == cur else f'<a href="{h}">{e(l)}</a>') for h, l in items) + "</nav>"


def footer(d):
    return (f'<footer>Generated {e(d["generated"])} from NIST CSRC CMVP and CAVP public pages. '
            'Verify any entry against the NIST certificate before relying on it.</footer>')


def fam_cls(f):
    return "dsa" if f == "ML-DSA" else "kem"


def tags(items, cls=""):
    return "".join(f'<span class="tag {cls}">{e(i)}</span>' for i in items)


def fam_tag(f):
    return f'<span class="tag {fam_cls(f)}">{e(f)}</span>'


def psets(m, f):
    return sorted({p.replace(f + "-", "") for c in m["cavp_detail"][f] for p in c["parameter_sets"]}, key=int)


def status_text(statuses):
    return "<br>".join(f'{e(s["status"])} <span class="muted">({e(s["date"])})</span>' for s in statuses)


# ------------------------------------------------------------- index ----
def build_index(d):
    mods = d["modules"]
    fams = d["families"]
    n = {f: sum(1 for m in mods if f in m["families"]) for f in fams}
    both = sum(1 for m in mods if all(f in m["families"] for f in fams))
    stats = [(n[f], f"active FIPS {d['standard']} modules with {f} approved") for f in fams]
    stats += [(both, "modules with both"), (d["modules_scanned"], "active modules scanned"),
              (len(d["in_process"]["likely"]), "modules in process that match algorithm tests")]
    stat_html = "".join(f'<div class="stat"><b>{v}</b><span>{e(t)}</span></div>' for v, t in stats)
    rows = []
    for m in mods:
        cells = []
        for f in fams:
            if f in m["families"]:
                cells.append(f'<td data-sort="1">{tags(psets(m, f), fam_cls(f))}<br><span class="muted num">'
                             f'{e(m[slug(f) + "_cavp_certs"])}</span></td>')
            else:
                cells.append('<td data-sort="0"><span class="muted">&mdash;</span></td>')
        rows.append(f"""<tr data-fam="{e(' '.join(m['families'].split(', ')) + (' both' if all(f in m['families'] for f in fams) else ''))}">
<td class="num" data-sort="{m['cmvp_cert']}"><a href="module-{m['cmvp_cert']}.html">{m['cmvp_cert']}</a></td>
<td>{e(m['vendor'])}</td>
<td><a href="module-{m['cmvp_cert']}.html">{e(m['module'])}</a></td>
<td>{e(m['type'])}<br><span class="muted">Level {e(m['level'])}</span></td>
{''.join(cells)}
<td class="num" data-sort="{iso(m['first_validated'])}">{e(m['first_validated'])}</td></tr>""")
    chips = ('<button class="chip active" type="button" data-fam-chip="all">All</button>'
             + "".join(f'<button class="chip" type="button" data-fam-chip="{e(f)}">{e(f)}</button>' for f in fams)
             + '<button class="chip" type="button" data-fam-chip="both">Both</button>')
    body = f"""
{top_nav("index.html")}
<h1>FIPS 140-3 modules validated with ML-DSA or ML-KEM</h1>
<p class="sub">Active CMVP certificates whose Approved Algorithms list includes ML-DSA ({FIPS['ML-DSA']}) or ML-KEM ({FIPS['ML-KEM']}). Snapshot of {e(d['generated'])}.</p>
<div class="stats">{stat_html}</div>
<h2>Validated modules</h2>
<div class="tools"><div class="chips">{chips}</div><input type="search" id="q" placeholder="Filter by vendor or module" aria-label="Filter"><span class="muted" id="count"></span></div>
<div class="wrap"><table id="t">
<thead><tr><th data-sort aria-sort="descending">CMVP cert</th><th data-sort>Vendor</th><th data-sort>Module</th><th>Type</th>
<th data-sort>ML-DSA params</th><th data-sort>ML-KEM params</th><th data-sort>Validated</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<p class="muted">Tags show tested parameter sets (ML-DSA-44/65/87 as 44, 65, 87; ML-KEM-512/768/1024 as 512, 768, 1024), with the CAVP certificates beneath.</p>
<h2>Where the rest are</h2>
<p><a href="in-process.html">Modules in process</a>: vendors with ML-DSA or ML-KEM algorithm tests and a module under CMVP review.<br>
<a href="cavp-gap.html">Algorithm tests without a validated module</a>: {len(d['cavp_without_module'])} CAVP validations across both algorithms ({', '.join(f'{d["cavp_counts"][f]} {f}' for f in fams)} in total).</p>
<h2>Method</h2>
<ol>
<li>List every {e(d['status'])} FIPS {e(d['standard'])} certificate from the {link(CMVP_BASE + '/validated-modules/search', 'CMVP validated modules search')}.</li>
<li>Fetch each certificate page and read the <em>Approved Algorithms</em> section. A module counts when an entry starts with &ldquo;ML-DSA&rdquo; or &ldquo;ML-KEM&rdquo;.</li>
<li>Pull the validations from the {link(CAVP_SEARCH, 'CAVP validation search')} (each operation queried separately, all result pages) and cross-check the module entries against them.</li>
<li>Fetch each referenced CAVP validation for parameter sets, signature interfaces or KEM functions, and operational environments.</li>
<li>Match unattached CAVP validations to the {link(CMVP_BASE + '/modules-in-process/modules-in-process-list', 'CMVP Modules In Process list')} by vendor and module name.</li>
</ol>
<div class="note"><b>Caveats.</b> Modules in process are not validated, and historical or revoked certificates are excluded.
Check the Security Policy for the exact services and operational environments covered.
Modules mentioning these algorithms only in allowed or non-approved text: {sum(len(v) for v in d['text_mentions_only'].values())}.</div>
{footer(d)}"""
    return page("FIPS 140-3 ML-DSA and ML-KEM modules", body, "FIPS 140-3 modules validated with ML-DSA or ML-KEM", JS)


# ------------------------------------------------------------ module ----
def build_module(d, m):
    sections = []
    for f in d["families"]:
        if f not in m["families"]:
            continue
        head = ("<th>Signature interfaces</th><th>Pre-hash</th>" if f == "ML-DSA" else "<th>Functions</th>")
        rows = []
        for c in m["cavp_detail"][f]:
            extra = (f"<td>{e(', '.join(c['interfaces'])) or '<span class=muted>n/a</span>'}</td>"
                     f"<td>{e(', '.join(c['prehash'])) or '<span class=muted>n/a</span>'}</td>" if f == "ML-DSA"
                     else f"<td>{e(', '.join(c['functions'])) or '<span class=muted>n/a</span>'}</td>")
            rows.append(f"""<tr>
<td class="num">{link(c['url'], c['cavp_cert'])}</td>
<td>{tags(c['ops'], fam_cls(f))}</td>
<td>{tags([p.replace(f + '-', '') for p in c['parameter_sets']], 'ok') or '<span class="muted">n/a</span>'}</td>
{extra}
<td>{'<br>'.join(e(o) for o in c['operating_environments']) or '<span class="muted">n/a</span>'}</td></tr>""")
        sections.append(f"""<h2>{f} algorithm validations (CAVP)</h2>
<div class="wrap"><table>
<thead><tr><th>CAVP cert</th><th>Operations</th><th>Parameter sets</th>{head}<th>Operational environments</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>""")
    sp = link(m["security_policy"], "Security Policy (PDF)") if m["security_policy"] else ""
    body = f"""
<nav class="crumbs"><a href="index.html">All modules</a> &rsaquo; Certificate {m['cmvp_cert']}</nav>
<h1>{e(m['module'])}</h1>
<p class="sub">{e(m['vendor'])} &middot; CMVP certificate #{m['cmvp_cert']}</p>
<dl class="kv">
<dt>Status</dt><dd>{e(m['status'])}</dd>
<dt>Standard</dt><dd>FIPS {e(d['standard'])}, overall Level {e(m['level'])}</dd>
<dt>Module type</dt><dd>{e(m['type'])}, {e(m['embodiment'])}</dd>
<dt>First validated</dt><dd>{e(m['first_validated'])}</dd>
<dt>Last updated</dt><dd>{e(m['last_updated'])}</dd>
<dt>Sunset</dt><dd>{e(m['sunset'])}</dd>
<dt>Algorithms</dt><dd>{''.join(fam_tag(f) for f in m['families'].split(', '))}</dd>
<dt>NIST pages</dt><dd>{link(m['url'], 'CMVP certificate')} &middot; {sp}</dd>
</dl>
{''.join(sections)}
<p class="muted">Parameter sets are shown by number (44, 65, 87 for ML-DSA; 512, 768, 1024 for ML-KEM).</p>
{footer(d)}"""
    return page(f"{m['module']} (cert {m['cmvp_cert']})", body, f"{m['vendor']} {m['module']}, PQC algorithm details")


# --------------------------------------------------------------- gap ----
def build_gap(d):
    fams = d["families"]
    rows_in = sorted(d["cavp_without_module"], key=lambda r: iso(r["date"]), reverse=True)
    vendors = Counter(r["vendor"] for r in rows_in)
    vchips = "".join(f'<button class="chip" type="button" data-v="{e(v)}">{e(v)} ({n})</button>' for v, n in vendors.most_common(12))
    fchips = ('<button class="chip active" type="button" data-fam-chip="all">All</button>'
              + "".join(f'<button class="chip" type="button" data-fam-chip="{e(f)}">{e(f)} ({sum(1 for r in rows_in if r["family"] == f)})</button>' for f in fams))
    rows = "".join(f"""<tr data-fam="{e(r['family'])}">
<td class="num" data-sort="{e(r['cavp_cert'])}">{link(r['url'], r['cavp_cert'])}</td>
<td>{fam_tag(r['family'])}</td>
<td>{e(r['vendor'])}</td><td>{e(r['implementation'])}</td>
<td>{tags(r['ops'], fam_cls(r['family']))}</td>
<td class="num" data-sort="{iso(r['date'])}">{e(r['date'])}</td></tr>""" for r in rows_in)
    body = f"""
{top_nav("cavp-gap.html")}
<h1>Algorithm tests without a validated module</h1>
<p class="sub">{len(rows_in)} CAVP validations ({', '.join(f'{sum(1 for r in rows_in if r["family"] == f)} {f}' for f in fams)}) are not referenced by any active FIPS 140-3 certificate for that algorithm (snapshot {e(d['generated'])}).</p>
<div class="note">A CAVP certificate shows the algorithm implementation passed testing. It is not a FIPS 140-3 module validation.
These implementations may be in modules still under review (see <a href="in-process.html">in process</a>), or may not be submitted to the CMVP at all.
An implementation tested for both algorithms appears once per algorithm.</div>
<div class="tools"><div class="chips">{fchips}</div></div>
<div class="tools"><input type="search" id="q" placeholder="Filter by vendor or implementation" aria-label="Filter"><span class="muted" id="count"></span></div>
<div class="chips">{vchips}</div>
<div class="wrap"><table id="t">
<thead><tr><th data-sort>CAVP cert</th><th data-sort>Algorithm</th><th data-sort>Vendor</th><th data-sort>Implementation</th><th>Operations</th><th data-sort aria-sort="descending">Validated</th></tr></thead>
<tbody>{rows}</tbody></table></div>
{footer(d)}"""
    return page("PQC algorithm tests without a module", body, "CAVP ML-DSA and ML-KEM validations not yet in a FIPS 140-3 module", JS)


# ------------------------------------------------------- in process ----
def build_inprocess(d):
    ip = d["in_process"]
    likely_rows = []
    for x in ip["likely"]:
        by_fam = {}
        for c in x["cavp"]:
            by_fam.setdefault(c["family"], []).append(c)
        cav = "<br>".join(fam_tag(f) + " " + " ".join(f'<span class="num">{link(c["url"], c["cavp_cert"])}</span>' for c in cs)
                          for f, cs in sorted(by_fam.items()))
        likely_rows.append(f"""<tr><td>{e(x['vendor'])}</td><td>{e(x['module'])}</td><td>{status_text(x['statuses'])}</td>
<td>{cav}</td><td>{e(x['cavp'][0]['implementation'])}</td></tr>""")
    vo_rows = []
    for v in ip["vendor_only"]:
        cav = "<br>".join(fam_tag(f) + f' <span class="muted">{len(cs)} cert{"s" if len(cs) != 1 else ""}</span>'
                          for f, cs in sorted(v["cavp"].items()))
        mods = "".join(f"<li>{e(m['module'])} <span class='muted'>({', '.join(e(s['status']) for s in m['statuses'])})</span></li>"
                       for m in v["modules"])
        summary = f"{len(v['modules'])} module{'s' if len(v['modules']) != 1 else ''}"
        vo_rows.append(f"<tr><td>{e(v['vendor'])}</td><td>{cav}</td><td><details><summary>{summary}</summary><ul>{mods}</ul></details></td></tr>")
    body = f"""
{top_nav("in-process.html")}
<h1>Modules in process with ML-DSA or ML-KEM algorithm tests</h1>
<p class="sub">Cross-reference of the CMVP Modules In Process list ({d['mip_total']} entries) against CAVP validations that are not yet in a validated module. Snapshot of {e(d['generated'])}.</p>
<div class="note"><b>These are inferences, not confirmations.</b> The in-process list shows a module name, vendor and review status, but not which algorithms the module covers.
A match means the module name equals or contains the tested implementation's name and the vendor is the same. Treat it as a lead and confirm with the vendor or the eventual certificate.</div>
<h2>Module name matches an algorithm test ({len(ip['likely'])})</h2>
<div class="wrap"><table>
<thead><tr><th>Vendor</th><th>Module in process</th><th>Status</th><th>CAVP certs (not in a validated module)</th><th>Tested implementation name</th></tr></thead>
<tbody>{''.join(likely_rows)}</tbody></table></div>
<h2>Same vendor, different module name ({len(ip['vendor_only'])} vendors)</h2>
<p class="muted">The vendor has algorithm tests without a module and other modules in process, but no module name lines up. These may or may not be related.</p>
<div class="wrap"><table>
<thead><tr><th>Vendor</th><th>Algorithm tests without a module</th><th>Other modules in process</th></tr></thead>
<tbody>{''.join(vo_rows)}</tbody></table></div>
{footer(d)}"""
    return page("PQC modules in process", body, "Modules in process that may add ML-DSA or ML-KEM")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    d = json.load(open(a.data))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(build_index(d), encoding="utf-8")
    (out / "cavp-gap.html").write_text(build_gap(d), encoding="utf-8")
    (out / "in-process.html").write_text(build_inprocess(d), encoding="utf-8")
    for m in d["modules"]:
        (out / f"module-{m['cmvp_cert']}.html").write_text(build_module(d, m), encoding="utf-8")
    print(f"wrote {3 + len(d['modules'])} pages to {out}")


if __name__ == "__main__":
    main()
