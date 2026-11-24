"""Headless end-to-end smoke test. Exits non-zero on any failure.

Usage:  python3 -m http.server 8765 --bind 127.0.0.1   (in the repo root)
        python3 tests/smoke.py [base-url]

Covers: onboarding, every dose rendering in both languages, a full lesson (Look → Play → Prove, self-reported),
the one-dose-per-day gate, the one-minute chord-change game, song goal setup / check-in / edit, dark theme,
the web manifest and icons, and loading the app with the network switched off (service worker).
It does not exercise the microphone: that needs a real instrument.
"""
import json
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
fails, errs = [], []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail and not ok else ''))
    if not ok:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    cx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = cx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

    # onboarding
    pg.goto(base + '?date=2026-11-24')
    pg.click('[data-act="lang"][data-l="en"]')
    pg.click('[data-act="start"][data-p="1"]')
    check('onboarding lands on home', pg.locator('.hero').count() == 1)
    check('placement marks four doses', pg.evaluate('Object.keys(__uke.S().doses).length') == 4)
    check('tab bar visible', pg.locator('.tabs').is_visible())

    # every dose, both languages, all three stages
    n = pg.evaluate('UKE.DOSES.length')
    for lang in ('en', 'pt'):
        pg.evaluate(f"__uke.S().lang='{lang}'; UKE.lang='{lang}'")
        bad = pg.evaluate("""() => { const bad = [];
            for (const d of UKE.DOSES) for (const st of [0, 1, 2]) { __uke.go({ name: 'dose', id: d.id, stage: st });
              const t = document.querySelector('#view').innerText; if (!t || /undefined|\\[object/.test(t)) bad.push(d.id + ':' + st); }
            return bad; }""")
        check(f'all {n} doses render in {lang}', not bad, str(bad))
    pg.evaluate("__uke.S().lang='en'; UKE.lang='en'; __uke.go({name:'home'})")

    # full lesson, self-reported
    dose_id = pg.get_attribute('.hero [data-act="dose"]', 'data-id')
    pg.click('.hero [data-act="dose"]')
    check('lesson opens in focus mode', pg.evaluate("document.body.classList.contains('focus-mode')"))
    pg.click('.dock [data-act="stage"]')
    pg.click('#along'); pg.wait_for_timeout(700)
    check('play-along runs', pg.evaluate('Player.on'))
    pg.click('#along')
    pg.click('#timer'); pg.wait_for_timeout(1200)
    check('timer counts down', pg.inner_text('#timer span') != '4:00')
    pg.click('.dock [data-act="stage"]')
    pg.click('[data-act="nomic"]')
    pg.click('[data-act="feel"][data-f="ok"]')
    check('result screen with XP', ' XP' in pg.inner_text('.result'))
    pg.click('.result [data-act="view"]')
    check('dose recorded as self-reported', pg.evaluate(f"__uke.S().doses[{dose_id}].level") == 'self')
    check('next dose waits until tomorrow', pg.locator('.hero.rest').count() == 1)
    check('streak shown', pg.inner_text('#streak') == '1')

    # one-minute changes (clock fast-forwarded)
    pg.clock.install()
    pg.click('.tabs [data-view="practice"]')
    pg.click('#cgpad')
    for _ in range(7):
        pg.click('#cgpad')
    pg.clock.run_for(61000)
    pg.clock.resume()
    pg.wait_for_timeout(100)
    rec = pg.evaluate("__uke.S().changes['C:G']")
    check('chord-change game stores the count', bool(rec) and rec['best'] == 7, json.dumps(rec))
    pg.click('[data-act="pick"][data-id="Bb"]')
    check('chord library switches', 'B♭' in pg.inner_text('.chord-card h3'))

    # song goal
    pg.click('.tabs [data-view="goal"]')
    pg.click('[data-goal-act="pick-song"] >> nth=1')
    pg.click('label.tick:has(input[name="tune"])')
    pg.click('label.tick:has(input[value="C"])')
    pg.click('#goal-setup button[type="submit"]')
    check('goal dashboard appears', pg.locator('.goal-hero').count() == 1)
    before = pg.evaluate("__uke.S().goal.history.length")
    pg.click('[data-goal-act="check"][data-result="easy"]')
    check('goal check-in recorded', pg.evaluate("__uke.S().goal.history.length") == before + 1)
    pg.click('.goal-edit summary')
    pg.select_option('#goal-edit select[name="minutes"]', '15')
    pg.click('#goal-edit button[type="submit"]')
    check('goal edit saves minutes', pg.evaluate("__uke.S().goal.minutes") == 15)

    # Song/artist search stays in-app; the learner selects a result before a plan is built.
    pg.on('dialog', lambda dialog: dialog.accept())
    pg.click('[data-goal-act="remove"]')
    pg.evaluate("""() => { const original = window.fetch; window.fetch = (url, options) =>
      String(url).includes('/api/search') ? Promise.resolve(new Response(JSON.stringify({songs:[{title:'Three Little Birds',artist:'Bob Marley'},{title:'Redemption Song',artist:'Bob Marley'}]}),{status:200,headers:{'Content-Type':'application/json'}})) :
      String(url).includes('/api/song') ? Promise.resolve(new Response(JSON.stringify({song:{title:'Redemption Song',artist:'Bob Marley',source:'https://example.org/redemption-song',key:'C',tempo:72,beats:4,sections:[{name:'Verse',chords:['C','Am','F','G']}]}}),{status:200,headers:{'Content-Type':'application/json'}})) : original(url, options); }""")
    check('plan requires song selection', pg.locator('#goal-setup button[type="submit"]').is_disabled())
    check('no paste or AI prompt controls', pg.locator('#goal-json, [data-goal-act="copy-prompt"], [data-goal-act="import"]').count() == 0)
    pg.fill('#song-search', 'Bob Marley')
    pg.locator('.song-result').first.wait_for()
    check('artist search suggests multiple songs', pg.locator('.song-result').count() == 2)
    pg.locator('.song-result').nth(1).click()
    check('selected song enables plan', pg.locator('#goal-setup button[type="submit"]').is_enabled())
    pg.fill('#song-search', 'Redemption')
    check('editing search clears selection', pg.locator('#goal-setup button[type="submit"]').is_disabled())
    pg.locator('.song-result').first.wait_for()
    pg.locator('.song-result').nth(1).click()
    pg.click('#goal-setup button[type="submit"]')
    pg.wait_for_function("__uke.S().goal?.song?.title === 'Redemption Song'")
    check('selected song builds plan in-app', pg.locator('.goal-lesson').count() == 1)

    # diary, theme, report
    pg.click('.tabs [data-view="diary"]')
    pg.click('[data-act="theme"][data-t="dark"]')
    check('dark theme applies', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(12, 26, 32)')
    check('log lists the chord-change session', '⇄' in pg.inner_text('.log'))
    pg.click('[data-act="theme"][data-t="auto"]')

    # reload keeps progress
    pg.reload()
    check('progress survives reload', pg.evaluate("__uke.S().xp") >= 10)

    # PWA: manifest, icons, service worker, offline
    man = pg.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    check('manifest is standalone with PNG icons', man['display'] == 'standalone' and any(i['sizes'] == '512x512' for i in man['icons']))
    ok = pg.evaluate("Promise.all(['icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'].map(u => fetch(u).then(r => r.ok))).then(a => a.every(Boolean))")
    check('icon files load', ok)
    pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
    pg.wait_for_timeout(1500)
    check('service worker controls the page', pg.evaluate("!!navigator.serviceWorker.controller"))
    cx.set_offline(True)
    pg.goto(base + '?view=practice')
    check('app loads offline', pg.locator('#cgpad').count() == 1)
    pg.evaluate("__uke.go({name:'dose',id:7,stage:0})")
    check('lesson renders offline', pg.locator('.chord-card').count() >= 1 or pg.locator('.vis .card').count() >= 1)
    cx.set_offline(False)

    real = [e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to load resource' not in e]
    check('no page or console errors', not real, str(real))
    b.close()

print(f"\n{len(fails)} failure(s)" if fails else '\nAll checks passed.')
sys.exit(1 if fails else 0)
