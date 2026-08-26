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

# inline gambar hero & logo sebagai data URI agar index.html tetap satu file mandiri
# (ikon PWA TIDAK di-inline: manifest memerlukan file nyata)
assets = ROOT / "assets"
if assets.exists():
    for p in sorted(assets.rglob("*")):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            if p.name.startswith("icon-") or p.name.startswith("favicon-"):
                continue
            rel = p.relative_to(ROOT).as_posix()
            mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            html = html.replace(rel, f"data:{mime};base64,{b64}")

# ---- PWA: salin ikon ke root, tulis manifest.json & sw.js ----
icons = ROOT / "assets" / "icons"
if icons.exists():
    for name in ("favicon-64.png", "icon-192.png", "icon-512.png"):
        src_f = icons / name
        if src_f.exists():
            (ROOT / name).write_bytes(src_f.read_bytes())

(ROOT / "manifest.json").write_text(
    '{\n'
    '  "name": "MATH LEGENDS: BATTLE ARENA",\n'
    '  "short_name": "Math Legends",\n'
    '  "description": "Game edukasi matematika kompetitif SMP/SMA",\n'
    '  "start_url": "./index.html",\n'
    '  "display": "standalone",\n'
    '  "orientation": "any",\n'
    '  "background_color": "#eef4ff",\n'
    '  "theme_color": "#4f46e5",\n'
    '  "icons": [\n'
    '    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },\n'
    '    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }\n'
    '  ]\n'
    '}', encoding="utf-8")

(ROOT / "sw.js").write_text(
    """// MATH LEGENDS — service worker sederhana (cache-first untuk aset)
const CACHE = 'math-legends-v0.7.0';
const ASSETS = ['./', './index.html', './manifest.json', './favicon-64.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Firestore/CDN lewat jaringan
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
""", encoding="utf-8")

assert "<link rel=\"stylesheet\"" not in html, "CSS belum ter-inline!"
body = html.split("<body>")[1]
assert 'src="js/' not in body and 'src="css/' not in body, "Masih ada referensi file eksternal!"
assert not re.search(r'assets/heroes/[\w-]+\.(png|jpe?g|webp|gif)', html), "Masih ada path gambar yang belum ter-inline!"

OUT.write_text(html, encoding="utf-8")
print(f"OK -> {OUT} ({len(html)/1024:.1f} KB)")
