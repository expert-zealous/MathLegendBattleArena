#!/usr/bin/env python3
"""
Build MATH LEGENDS: BATTLE ARENA.
Menyatukan src/index.html + css + js menjadi satu file index.html mandiri
(bisa langsung dibuka, di-preview, atau diunggah ke GitHub Pages).

Pemakaian:  python3 build.py
"""
import re
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

html = (SRC / "index.html").read_text(encoding="utf-8")

# inline CSS
def css_repl(m):
    href = m.group(1)
    css = (SRC / href).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

# inline JS (urutan dipertahankan)
def js_repl(m):
    src = m.group(1)
    js = (SRC / src).read_text(encoding="utf-8")
    return "<script>\n" + js + "\n</script>"

html = re.sub(r'<script src="([^"]+)"></script>', js_repl, html)

# inline gambar hero sebagai data URI agar index.html tetap satu file mandiri
assets = ROOT / "assets"
if assets.exists():
    for p in sorted(assets.rglob("*")):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            rel = p.relative_to(ROOT).as_posix()
            mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            html = html.replace(rel, f"data:{mime};base64,{b64}")

assert "<link rel=\"stylesheet\"" not in html, "CSS belum ter-inline!"
body = html.split("<body>")[1]
assert 'src="js/' not in body and 'src="css/' not in body, "Masih ada referensi file eksternal!"
assert not re.search(r'assets/heroes/[\w-]+\.(png|jpe?g|webp|gif)', html), "Masih ada path gambar yang belum ter-inline!"

OUT.write_text(html, encoding="utf-8")
print(f"OK -> {OUT} ({len(html)/1024:.1f} KB)")
