# Ukulele Master

A bilingual (English / Brazilian Portuguese) daily-dose ukulele game. Installable PWA (Progressive Web App), hosted privately on Vercel with one server-side song lookup route. The browser files remain plain HTML, CSS and JavaScript with no build step or dependencies.

Live: https://ukulele-master-two.vercel.app/ · Repo: https://github.com/educrvz/ukulele-master

Read first: the newest entries in `PROGRESS.md`, then `docs/CONTEXT.md` and `docs/RUNBOOK.md`.

## Run and test
- Serve: `python3 -m http.server 8765 --bind 127.0.0.1` in the repo root, then open `http://127.0.0.1:8765/`.
- `?date=YYYY-MM-DD` overrides "today" (tests the one-dose-per-day gate). `?view=practice|goal|diary` opens a tab directly.
- Test before every push: `python3 tests/smoke.py` (headless Playwright; must print "All checks passed."). Also run `node tests/song-api.test.js` when changing the lookup route.
- Touching `js/dsp.js` or `js/mic.js`? Also run `node tests/listening.test.js` (no browser needed; must print "All listening checks passed."). To hear what the checks make of a real recording: `python3 tests/fake-mic.py recording.wav` (replays it as the microphone) or `node tests/lib/trace.js recording.wav` (per-sound scores). Do not commit personal voice recordings: the repo is public.
- Visual check: `python3 tests/shots.py <folder>` writes phone, desktop and dark-mode screenshots. Look at them.
- Deploy: merge to `main`; Vercel (project `ukulele-master`) serves the private app and posts a preview link on every pull request; check the preview before merging. GitHub Pages redirects to the private address and transfers local progress in the URL fragment.
- Learner's record and app guide live in Notion; links are in `docs/RUNBOOK.md`. Update the Notion app guide's change history when shipping something the learner will notice.

## Layout
- `index.html`: shell (top bar, tab bar, script tags in dependency order).
- `css/style.css`: design tokens (light + dark), then components by section. Use the tokens; do not hard-code colours.
- `js/data.js`: chords and the 48-dose curriculum (all text in `B(en, pt)` pairs).
- `js/diagrams.js`: SVG chord chart, player's-view neck with sounded notes, strum patterns.
- `js/dsp.js`: pure pitch / chroma / onset functions. `js/mic.js`: microphone checks and recordings (IndexedDB).
- `js/audio.js`: synthesised demo sound and play-along. `js/ui.js`: icons, toast, confetti, wake lock, theme.
- `js/song-goal.js` + `js/song-catalog.js`: Song Goal Mode. `js/app.js`: views, navigation, progress.
- `api/song.js`: server-only chord source search through Vercel AI Gateway. Never expose the key in browser code or Git.
- `sw.js` + `js/pwa.js` + `manifest.webmanifest` + `icons/`: install and offline support.
- `tools/make-icons.py`: regenerate PNG icons after editing `icons/icon.svg`.

## Rules for changes
- **Never rename the localStorage key `uke-master-v1`** or change the shape of saved progress without a migration: the learner's progress lives only in his browser.
- **New file the app loads? Add it to `SHELL` in `sw.js`**, or it will be missing offline. The smoke test's offline check catches most cases.
- The service worker is network-first, so deploys need no version bump. Change `CACHE` in `sw.js` only to force-drop old cached files.
- Every user-facing string goes through `T(en, pt)` or a `B(en, pt)` pair. No English-only text.
- Phone first: check 390 px wide, both themes. Tap targets at least 44 px. Respect `prefers-reduced-motion`.
- No frameworks, bundlers or npm packages without an ADR (Architecture Decision Record) in `docs/decisions/`.

## Teaching rules (from the learner's Notion home page)
- One small idea per dose: about 1 minute looking, 4 minutes playing.
- Every note or chord shows letter + Portuguese name: `A (Lá)`, `Am (Lá menor)`.
- Every chord shows both views: finger placement and the note each string sounds; say whether repeated names are the same pitch or an octave apart.
- G (Sol maior) uses the learner's fingering 2–3–1. Standard high-G tuning, right-handed.
- Keep evidence honest: `mic` (verified by microphone) is distinct from `self` (self-reported). Never mark mastery from silence.
- Built-in curriculum songs remain public domain or original. Song goals may use any title, but store chord symbols and short section sequences only, with a source link; do not copy lyrics or full third-party chord sheets into the app.
