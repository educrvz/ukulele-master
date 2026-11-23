"""Regenerate the PNG app icons from icons/icon.svg (headless Chromium, no visible window).

Usage (from the repo root):  python3 tools/make-icons.py

Writes icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png (180, square corners: iOS rounds them)
and icons/maskable-512.png (full-bleed background, artwork inside the 80% safe zone for Android adaptive icons).
"""
import pathlib
import re
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent / 'icons'
svg = (root / 'icon.svg').read_text()

square = svg.replace('rx="116"', 'rx="0"')
# Shrink everything after the background rectangle into the maskable safe zone.
head, rest = re.split(r'(?<=fill="url\(#sky\)"/>)', square, maxsplit=1)
maskable = head + '<g transform="translate(51 51) scale(.8)">' + rest.replace('</svg>', '</g></svg>')

jobs = [('icon-192.png', svg, 192, True), ('icon-512.png', svg, 512, True),
        ('apple-touch-icon.png', square, 180, False), ('maskable-512.png', maskable, 512, False)]

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, src, size, transparent in jobs:
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.set_content(f'<style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{size}px;height:{size}px}}</style>{src}')
        pg.screenshot(path=str(root / name), omit_background=transparent)
        pg.close()
        print('wrote', name)
    b.close()
