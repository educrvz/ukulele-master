"""Headless screenshots of every main screen, on phone and desktop sizes.

Usage:  python3 -m http.server 8765 --bind 127.0.0.1   (in the repo root)
        python3 tests/shots.py <output-folder> [tag]

Prints any page or console errors. Never opens a visible window.
"""
import sys
from playwright.sync_api import sync_playwright

out = sys.argv[1]
tag = sys.argv[2] if len(sys.argv) > 2 else 'shot'
base = 'http://127.0.0.1:8765/'
state = {
    "lang": "en", "onboarded": True,
    "doses": {"1": {"on": "2026-11-13", "level": "mic"}, "2": {"on": "2026-11-14", "level": "self"},
              "3": {"on": "2026-11-16", "level": "self"}, "4": {"on": "2026-11-17", "level": "self"}},
    "log": [{"d": "2026-11-19", "id": 4, "level": "self", "feel": "ok"},
            {"d": "2026-11-20", "id": 4, "level": "self", "feel": "ok"},
            {"d": "2026-11-23", "id": 3, "level": "mic", "feel": "easy"}],
    "xp": 70, "newOn": None,
}

with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    # m = phone, d = desktop, k = phone in dark mode
    for name, vp in (('m', {'width': 390, 'height': 844}), ('d', {'width': 1280, 'height': 860}), ('k', {'width': 390, 'height': 844})):
        cx = b.new_context(viewport=vp, device_scale_factor=1 if name == 'd' else 2, color_scheme='dark' if name == 'k' else 'light')
        pg = cx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(base)
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'{out}/{tag}-{name}-0onb.png')
        pg.evaluate("s=>localStorage.setItem('uke-master-v1', JSON.stringify(s))", state)
        pg.goto(base + '?date=2026-11-24')
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'{out}/{tag}-{name}-1home.png')
        pg.screenshot(path=f'{out}/{tag}-{name}-1home-full.png', full_page=True)
        for st in (0, 1, 2):
            pg.evaluate(f"window.__uke.go({{name:'dose',id:5,stage:{st}}})")
            pg.wait_for_timeout(350)
            pg.screenshot(path=f'{out}/{tag}-{name}-2dose{st}.png', full_page=True)
        for v in ('goal', 'practice', 'diary'):
            pg.evaluate(f"window.__uke.go({{name:'{v}'}})")
            pg.wait_for_timeout(350)
            pg.screenshot(path=f'{out}/{tag}-{name}-4{v}.png', full_page=True)
        # song goal dashboard with a starter song
        pg.evaluate("__uke.go({name:'goal'})")
        pg.click('[data-goal-act="pick-song"] >> nth=1')
        pg.click('#goal-setup button[type="submit"]')
        pg.wait_for_timeout(350)
        pg.screenshot(path=f'{out}/{tag}-{name}-5goaldash.png', full_page=True)
        cx.close()
    print('errors:', errs)
    b.close()
