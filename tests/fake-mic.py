"""Plays a WAV file into headless Chromium as if it were the microphone, and reports what a listening check hears.

Usage:  python3 tests/fake-mic.py <recording.wav> [base-url] [dose-id] [seconds]

Defaults: local server, dose 6 ("Steady four", 16 even strums), 25 seconds. The WAV loops if it is shorter.
Use it to replay a real recording (talking, room noise, a real ukulele) through the real browser audio path:
the count should stay near 0 for anything that is not the lesson's chord. Never opens a visible window.
"""
import sys
from playwright.sync_api import sync_playwright

wav = sys.argv[1]
base = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/'
dose = sys.argv[3] if len(sys.argv) > 3 else '6'
secs = float(sys.argv[4]) if len(sys.argv) > 4 else 25

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                                f'--use-file-for-fake-audio-capture={wav}', '--autoplay-policy=no-user-gesture-required'])
    cx = b.new_context(permissions=['microphone'])
    pg = cx.new_page()
    pg.goto(base)
    pg.evaluate("localStorage.setItem('uke-master-v1', JSON.stringify({lang:'en',onboarded:true,doses:{},log:[],xp:0,newOn:null}))")
    pg.goto(base)
    pg.evaluate(f"__uke.go({{name:'dose',id:{dose},stage:2}})")
    pg.click('#listen')
    pg.wait_for_timeout(int(secs * 1000))
    live = pg.inner_text('#live').replace('\n', ' ')
    msg = pg.inner_text('#chkmsg')
    print(f'{base} · dose {dose} · after {secs:.0f} s of "{wav.split("/")[-1]}": {live} | {msg}')
    b.close()
