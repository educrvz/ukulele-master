"""Capture the single-screen v4 flow in a hidden Chromium browser.

Usage: python3 tests/shots.py <output-folder> [tag]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
tag = sys.argv[2] if len(sys.argv) > 2 else 'shot'
base = sys.argv[3] if len(sys.argv) > 3 else 'http://127.0.0.1:8765/'
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode, viewport in [('phone', {'width': 390, 'height': 844}), ('desktop', {'width': 1280, 'height': 860})]:
        c = b.new_context(viewport=viewport, device_scale_factor=2 if mode == 'phone' else 1)
        page = c.new_page(); page.goto(base + '?date=2026-11-26')
        page.click('[data-act="lang"][data-l="en"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-setup.png'))
        page.click('[data-goal-act="pick-song"][data-title="Three Little Birds"]')
        page.click('#goal-setup button[type="submit"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-tuner.png'))
        page.click('[data-goal-act="tune-self"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-hold.png'))
        # Jump to downstrum to verify animated index-finger guide
        page.click('#top-song')
        page.screenshot(path=str(out / f'{tag}-{mode}-drawer.png'))
        page.click('[data-goal-act="jump-step"][data-step="downstrum"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-downstrum.png'))
        # Jump to single chord C
        page.click('#top-song')
        page.click('[data-goal-act="jump-step"][data-step="chord:C"]')
        page.screenshot(path=str(out / f'{tag}-{mode}-chord.png'))
        # Complete C to capture Reward stage
        page.click('[data-goal-act="reveal-checkin"]')
        page.click('[data-goal-act="check"][data-result="easy"]')
        page.wait_for_timeout(550)
        page.screenshot(path=str(out / f'{tag}-{mode}-reward.png'))
        page.click('[data-goal-act="continue"]')
        # Dark mode on 2-chord change lesson
        page.click('#top-menu')
        page.click('[data-act="sheettab"][data-tab="diary"]')
        page.click('[data-act="theme"][data-t="dark"]')
        page.click('[data-act="sheettab"][data-tab="song"]')
        page.click('[data-goal-act="jump-step"][data-step="change:C:F"]')
        page.evaluate("document.querySelectorAll('.confetti').forEach(el => el.remove())")
        page.screenshot(path=str(out / f'{tag}-{mode}-change-dark.png'))
        c.close()
    b.close()
