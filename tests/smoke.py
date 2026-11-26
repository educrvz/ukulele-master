"""Headless single-screen v4 journey, zero-scroll, daily tuner, and offline PWA smoke test. Serve repo on port 8765 first."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
fails, errors = [], []

def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail and not ok else ''))
    if not ok:
        fails.append(name)

def check_no_scroll(pg, label):
    dims = pg.evaluate("""() => {
      const stage = document.querySelector('.stage-body');
      return {
        docH: document.documentElement.scrollHeight,
        winH: window.innerHeight,
        docW: document.documentElement.scrollWidth,
        winW: window.innerWidth,
        bodyScroll: stage ? stage.scrollHeight - stage.clientHeight : 0,
      };
    }""")
    ok = dims['docH'] <= dims['winH'] + 2 and dims['docW'] <= dims['winW'] and dims['bodyScroll'] <= 4
    check(f'zero scroll on {label}', ok, str(dims))

with sync_playwright() as p:
    browser = p.chromium.launch()
    cx = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow')
    pg = cx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(base + '?date=2026-11-26')

    # 1. Onboarding -> Song picker
    pg.click('[data-act="lang"][data-l="en"]')
    check('song selection is first screen', pg.locator('#goal-setup').count() == 1 and pg.locator('.tabs').count() == 0)
    check('selection required', pg.locator('#goal-setup button[type="submit"]').is_disabled())
    check_no_scroll(pg, 'song picker')

    pg.click('[data-goal-act="pick-song"][data-title="Three Little Birds"]')
    pg.click('#goal-setup button[type="submit"]')
    check('Three Little Birds goal saved', pg.evaluate('__uke.S().goal.title') == 'Three Little Birds')

    # 2. Daily visual tuner front door
    check('daily tuner opens with 4 string pads & gauge', pg.locator('.tpad').count() == 4 and pg.locator('.gauge .needle').count() == 1)
    check('tuning precedes lesson check-in', pg.locator('[data-goal-act="tune-self"]').count() == 1 and pg.locator('[data-goal-act="reveal-checkin"]').count() == 0)
    check_no_scroll(pg, 'daily tuner')

    # Tap individual G string pad -> loads CC0 recorded bank
    pg.click('[data-goal-act="tune-string"][data-s="0"]')
    pg.wait_for_function("Snd.mode !== 'loading'")
    check('recorded bank loaded from string pad', pg.evaluate('Snd.mode') == 'recorded', pg.evaluate('Snd.mode'))

    # Confirm tuned (self) -> enters lesson 1 (Hold)
    pg.click('[data-goal-act="tune-self"]')
    check('foundation starts with holding', 'Hold the ukulele' in pg.locator('.lesson-title').inner_text())
    check('tuning is separate from mastery', pg.evaluate("__uke.S().goal.mastery['tune'] === undefined && __uke.S().goal.tunedOn === '2026-11-26'"))
    check('check-in buttons hidden until I played it', pg.locator('[data-goal-act="reveal-checkin"]').count() == 1 and pg.locator('[data-goal-act="check"]').count() == 0)
    check_no_scroll(pg, 'hold lesson')

    # 3. 2-step check-in reveal + hard keeps lesson + reward stage
    remaining = pg.evaluate('SongGoal.plan(__uke.S().goal, "2026-11-26").remaining')
    pg.click('[data-goal-act="reveal-checkin"]')
    pg.click('[data-goal-act="check"][data-result="hard"]')
    check('reward stage shows after check-in', pg.locator('.stage-reward').count() == 1)
    check_no_scroll(pg, 'reward stage (hard)')
    pg.click('[data-goal-act="continue"]')
    check('hard check-in keeps lesson', 'Hold the ukulele' in pg.locator('.lesson-title').inner_text())

    # Complete hold (easy) -> reward -> open strings
    pg.click('[data-goal-act="reveal-checkin"]')
    pg.click('[data-goal-act="check"][data-result="easy"]')
    check('reward shows weekly momentum', pg.locator('.rhythm-card').count() == 1 and '1/4' in pg.locator('.rhythm-head').inner_text())
    check_no_scroll(pg, 'reward stage (easy)')
    pg.click('[data-goal-act="continue"]')
    check('next lesson is open strings', 'open strings' in pg.locator('.lesson-title').inner_text())
    check('plan recalculates after check-in', pg.evaluate('SongGoal.plan(__uke.S().goal, "2026-11-26").remaining') < remaining)
    check('history distinguishes self report', pg.evaluate("__uke.S().goal.history[0].evidence === 'self'"))
    check_no_scroll(pg, 'open strings lesson')

    # Jump to single chord & 2-chord change via Song Roadmap drawer (ADR 0004: never hard-lock!)
    pg.click('#top-song')
    check('song drawer opens', pg.locator('#sheet[open]').count() == 1 and pg.locator('.roadmap-btn').count() >= 6)
    pg.click('[data-goal-act="jump-step"][data-step="chord:C"]')
    check('single chord shows both views side by side', pg.locator('.compact-pair svg').count() == 2)
    check_no_scroll(pg, 'single chord lesson (C)')

    pg.click('#top-song')
    pg.click('[data-goal-act="jump-step"][data-step="change:C:F"]')
    check('2-chord change shows both chord pairs', pg.locator('.pair-stack .goal-diagram').count() == 2)
    check_no_scroll(pg, '2-chord change lesson (C to F)')

    pg.click('#top-song')
    pg.click('[data-goal-act="jump-step"][data-step="section:0"]')
    check('section shows bars + active paired chord', pg.locator('.bar-chip').count() >= 2 and pg.locator('.compact-pair svg').count() == 2)
    check_no_scroll(pg, 'section lesson')

    # 4. Reload same day skips tuner; next day reopens tuner automatically!
    pg.reload()
    check('same-day reload remembers tuning', pg.locator('.stage-lesson').count() == 1)
    check('check-in survives reload', pg.evaluate("__uke.S().goal.mastery.hold === 2"))
    pg.click('#top-tune')
    check('top-bar tune button reopens tuner anytime', pg.locator('.stage-tune').count() == 1)

    pg.goto(base + '?date=2026-11-27')
    check('new day opens tuner automatically', pg.locator('.stage-tune').count() == 1 and pg.locator('.tpad').count() == 4)

    # 5. Portuguese language check
    pg.click('#lang')
    check('Portuguese tuning view', 'Afine G' in pg.locator('.stage-tune h1').inner_text())
    pg.click('[data-goal-act="tune-self"]')
    check('Portuguese lesson view', 'cordas soltas' in pg.locator('.lesson-title').inner_text())
    pg.click('#lang')  # back to EN

    # 6. Drawer: Diary, Dark Theme, Edit minutes
    pg.click('#top-menu')
    pg.click('[data-act="sheettab"][data-tab="diary"]')
    check('diary shows song check-ins', 'Hold the ukulele' in pg.locator('#sheet .log').inner_text())
    pg.click('[data-act="theme"][data-t="dark"]')
    check('dark theme applies', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(12, 26, 32)')
    pg.click('[data-act="sheettab"][data-tab="song"]')
    pg.click('#sheet .goal-edit summary')
    pg.select_option('#goal-edit select[name="minutes"]', '20')
    pg.click('#goal-edit button[type="submit"]')
    check('changing minutes replans goal', pg.evaluate('__uke.S().goal.minutes') == 20)
    pg.click('[data-act="closesheet"]')

    # 7. Migration archives pre-v3 state cleanly
    pg.evaluate("localStorage.setItem('uke-master-v1', JSON.stringify({lang:'en',onboarded:true,doses:{1:{on:'2026-11-01',level:'self'}},log:[{d:'2026-11-01',id:1}],xp:20,goal:{title:'Old Song',history:[]}}))")
    pg.reload()
    check('old journey archived', pg.evaluate("__uke.S().previousJourneys?.length === 1 && __uke.S().previousJourneys[0].goal.title === 'Old Song'"))
    check('migration restarts at song selection', pg.locator('#goal-setup').count() == 1)

    # 8. In-app search suggestions + unsourced song still tunes & teaches foundations
    pg.evaluate("""() => { const old = fetch; window.fetch = (url, options) => String(url).includes('/api/search') ? Promise.resolve(new Response(JSON.stringify({songs:[{title:'Three Little Birds',artist:'Bob Marley & The Wailers'},{title:'Redemption Song',artist:'Bob Marley'}]}), {status:200,headers:{'Content-Type':'application/json'}})) : old(url, options); }""")
    pg.fill('#song-search', 'Bob Marley')
    pg.locator('.song-result').first.wait_for()
    check('artist search suggests choices', pg.locator('.song-result').count() == 2)
    pg.locator('.song-result').nth(1).click()
    check('choosing suggestion enables goal', pg.locator('#goal-setup button[type="submit"]').is_enabled())
    check('no external AI paste flow', pg.locator('#goal-json, [data-goal-act="copy-prompt"]').count() == 0)
    pg.click('#goal-setup button[type="submit"]')
    check('unsourced song still offers tuning', pg.locator('[data-goal-act="tune-self"]').count() == 1)
    pg.click('[data-goal-act="tune-self"]')
    check('unsourced song still offers foundations', 'Hold the ukulele' in pg.locator('.lesson-title').inner_text())

    # Switch back to Three Little Birds via drawer, check archive & backup
    pg.on('dialog', lambda d: d.accept())
    pg.click('#top-menu')
    pg.click('[data-goal-act="remove"]')
    pg.click('[data-goal-act="pick-song"][data-title="Three Little Birds"]')
    pg.click('#goal-setup button[type="submit"]')
    pg.click('#top-menu')
    pg.click('[data-act="sheettab"][data-tab="diary"]')
    pg.click('#sheet details.card > summary')
    check('archived goal remains readable', 'Old Song' in pg.locator('#sheet details.card').inner_text())
    check('backup import and export available', pg.locator('#imp').count() == 1 and pg.locator('[data-act="export"]').count() == 1)
    pg.click('[data-act="closesheet"]')

    # 9. Service worker & offline load
    pg.evaluate('navigator.serviceWorker.ready.then(() => true)')
    pg.wait_for_timeout(700)
    check('service worker controls page', pg.evaluate('!!navigator.serviceWorker.controller'))
    cx.set_offline(True)
    pg.reload()
    check('offline goal and tuning render', pg.locator('.stage-tune').count() == 1 and pg.locator('[data-goal-act="tune-self"]').count() == 1)
    check('offline sample available', pg.evaluate("fetch('audio/ukulele/C4.mp3').then(r => r.ok)"))
    pg.click('[data-goal-act="tune-string"][data-s="1"]')
    pg.wait_for_function("Snd.mode !== 'loading'")
    check('recorded bank decodes offline', pg.evaluate('Snd.mode') == 'recorded')
    check('no page errors', not errors, str(errors))
    browser.close()

print(f'\n{len(fails)} failure(s)' if fails else '\nAll checks passed.')
sys.exit(1 if fails else 0)
