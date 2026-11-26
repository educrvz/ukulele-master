"""Capture the song-first flow in a hidden Chromium browser.

Usage: python3 tests/shots.py <output-folder> [tag]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
tag = sys.argv[2] if len(sys.argv) > 2 else 'shot'
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode, viewport in [('phone', {'width': 390, 'height': 844}), ('desktop', {'width': 1280, 'height': 860})]:
        c = b.new_context(viewport=viewport, device_scale_factor=2 if mode == 'phone' else 1)
        page = c.new_page(); page.goto('http://127.0.0.1:8765/')
        page.click('[data-act="lang"][data-l="en"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-setup.png'))
        page.click('[data-goal-act="pick-song"][data-title="Three Little Birds"]')
        page.click('#goal-setup button[type="submit"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-tuning.png'))
        page.click('[data-goal-act="tune-self"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-lesson.png'))
        page.click('.tabs [data-view="diary"]')
        page.click('[data-act="theme"][data-t="dark"]')
        page.click('.tabs [data-view="home"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-lesson-dark.png'))
        c.close()
    b.close()
