# Ukulele Master

Learn ukulele in small daily doses, in English and Portuguese. One idea, one picture, one exercise, and a microphone check that confirms what you played.

**Play it:** <https://ukulele-master-two.vercel.app/> — private Vercel sign-in, phone installation, and offline practice.

<p>
  <img src="docs/screenshots/home.png" alt="Home screen: today's dose, week strip and the journey" width="260">
  <img src="docs/screenshots/lesson-dark.png" alt="A lesson in dark mode with both chord views" width="260">
</p>

## What is in it

| Screen | What it does |
| --- | --- |
| **Today** | Today's five-minute dose, this week's practice days, your song goal and level, and the journey: 48 doses on 8 islands, then a generated daily challenge. One new dose per day; replays are free. |
| **Lesson** | Full-screen, three steps: **Look** (one idea with the chord diagram), **Play** (numbered steps, play-along sound, metronome, four-minute timer; the screen stays awake), **Prove** (microphone check, or an honest self-report). |
| **Song** | Type a song or artist, select a suggestion, and set a date. The app finds and adapts a chord source, turns the song into tiny lessons, and replans after every check-in. Five starter songs work offline. |
| **Practice** | Tuner, metronome, the one-minute chord-change game, and the full chord library. |
| **Diary** | Streak, calendar, recordings, practice log, progress report for Notion, backup export/import, light/dark appearance, install. |

Every note and chord is shown as letter + Portuguese name, for example `G (Sol maior)`. Every chord has two views: where the fingers go, and the note each string sounds.

## Install on a phone

1. Open <https://ukulele-master-two.vercel.app/> on the phone and sign in.
2. **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
   **Android (Chrome):** tap *Install* on the home banner, or menu → *Install app*.
3. Open it from the home screen. It runs full-screen and works without internet.

Progress and recordings are stored in that browser on that device only. Opening the old GitHub Pages address online transfers saved progress to the new address; recordings remain on the old address. To move devices, use Diary → *Export backup*, then *Import backup* on the other one.

## Run locally

No build step and no dependencies for the app itself.

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/>. Add `?date=YYYY-MM-DD` to pretend it is another day.

## Test

Needs Python Playwright with Chromium (headless). With the local server running:

```bash
python3 tests/smoke.py
node tests/song-api.test.js
```

```bash
python3 tests/shots.py /tmp/uke-shots
```

The microphone logic has its own tests, which need only Node:

```bash
node tests/listening.test.js
```

They push synthetic room noise, hum, taps, a voice-like sound and plucked-string strums through the real listening code, and fail if noise or talking is counted as playing. `python3 tests/fake-mic.py recording.wav` replays any WAV as the microphone in a headless browser.

`smoke.py` checks onboarding, all 48 doses in both languages, a full lesson, the chord-change game, in-app song suggestions and selection, dark mode, and offline use. `shots.py` saves screenshots of every screen for phone, desktop and dark mode.

## Folder layout

```text
index.html             page shell: top bar, tab bar, script tags
manifest.webmanifest   install metadata (name, icons, shortcuts)
sw.js                  service worker: offline cache, network-first updates
css/style.css          design system: tokens, light + dark themes, all components
js/
  data.js              chords and the 48-dose curriculum (bilingual text)
  diagrams.js          SVG chord chart, player's-view neck, strum patterns
  dsp.js               pitch / chroma / onset maths (pure functions)
  audio.js             synthesised demo sound and the play-along scheduler
  mic.js               microphone checks and recordings (IndexedDB)
  ui.js                icons, toast, confetti, haptics, wake lock, theme
  pwa.js               service-worker registration and install prompt
  migrate.js           one-time progress transfer from old GitHub Pages address
  song-catalog.js      starter songs (chords only, with source links)
  song-goal.js         Song Goal Mode: plan, lessons, check-ins
  app.js               views, navigation, progress (localStorage `uke-master-v1`)
icons/                 app icons (SVG source + generated PNGs)
tools/make-icons.py    regenerates the PNG icons from icons/icon.svg
tests/                 smoke test and screenshot script
api/song.js            server-side lookup route and capped model fallback
lib/chord-source.js    direct chord-source search and short section extraction
docs/                  CONTEXT.md, RUNBOOK.md, decisions/, screenshots/
AGENTS.md              rules for AI coding agents (CLAUDE.md / GEMINI.md point here)
PROGRESS.md            shared change log between models, newest first
```

## Documentation

- [docs/CONTEXT.md](docs/CONTEXT.md) — who it is for, how it is built, data model.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — run, test, deploy, roll back.
- [docs/decisions/](docs/decisions/) — lasting choices and why.
- [PROGRESS.md](PROGRESS.md) — what changed, when, and what is still unverified.
- Learner's home page and class log (private Notion): [Ukulele — lessons, visuals & progress](https://app.notion.com/p/417eeae1044a8102acf7dc2bdce60a7a).
- App guide for the learner (private Notion): [Ukulele Master app — guide & documentation](https://app.notion.com/p/421eeae1044a8113b377fd6bcdeb3c94).

## Hosting

| Host | Address | Use |
| --- | --- | --- |
| Vercel | <https://ukulele-master-two.vercel.app/> | Protected app and song lookup; branch preview links. |
| GitHub Pages | <https://educrvz.github.io/ukulele-master/> | Public redirect to Vercel, carrying local progress in the URL fragment. |

Progress is saved per address. The old address transfers its localStorage state on an online visit.

## Honest limits

- Microphone checks have not yet been calibrated with a real ukulele and a real phone microphone.
- Demonstration sound is synthesised, not a recording.
- Automatic song lookup needs an internet connection and a trustworthy chord source. If search fails, a manual chord-only import is available.
