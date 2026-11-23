# Progress log

## 2026-11-23 — Version 2: redesign, installable PWA, documentation (Claude Fable 5.2)
- **Redesign.** New design system in `css/style.css` (tokens, light and dark themes, automatic or chosen in Diary). Floating tab bar with icons (Today, Song, Practice, Diary). Home shows the week strip, today's dose with its chord chart, song goal and level cards, and the journey as collapsible islands with a winding path instead of one 9,000 px list.
- **Lessons are easier to play.** Full-screen focus mode with a Look / Play / Prove progress bar, numbered step cards, and a sticky dock holding play-along, metronome, tempo, four-minute timer and the next button, so nothing needs scrolling with a ukulele in hand. The screen stays awake during a lesson. Confetti, a chime and a short vibration on completion; level-up notice.
- **New: one-minute chord changes** in Practice (pick two chords, tap after each clean change, best score kept per pair, logged as self-reported, included in the progress report). Fits the current Notion focus on the C (Dó maior) ↔ G (Sol maior) change.
- **Installable and offline.** `manifest.webmanifest` with PNG and maskable icons, `sw.js` (precache, network-first), `js/pwa.js` (install button on Android/desktop, Share → Add to Home Screen hint on iPhone, "New version ready" notice). Home-screen shortcuts `?view=practice` and `?view=goal`.
- **Song Goal:** restyled; starter songs are tappable; skill check uses toggle chips; date/minutes are edited in an inline form instead of browser prompts. Planning logic unchanged.
- **Kept:** localStorage key `uke-master-v1` and data shape (existing progress carries over; `changes` and `theme` are new optional fields), curriculum, diagrams, DSP and microphone logic, teaching rules.
- **Organisation:** `icons/`, `tools/make-icons.py`, `tests/smoke.py`, `tests/shots.py`, `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/decisions/0001`, fuller `README.md` and `AGENTS.md`. Root `icon.svg` moved to `icons/`. Local copy re-linked to GitHub (it was an untracked copy of the first commit).
- **Checks:** `tests/smoke.py` 26/26 in headless Chromium (onboarding, all 48 doses in both languages and all stages, full lesson, day gate, chord-change game, song goal setup/check-in/edit, dark theme, manifest and icons, service worker control, offline load). Screenshots reviewed on phone, desktop and dark mode.
- **Deployed:** pull request 1 merged into `main` on 2026-11-23; GitHub Pages build succeeded; `tests/smoke.py` passes 26/26 against https://educrvz.github.io/ukulele-master/.
- **Unverified:** real install on an iPhone/Android home screen; microphone checks with a real ukulele (unchanged from before); wake lock and vibration on iOS (iOS Safari does not vibrate; wake lock needs iOS 16.4+); Lighthouse PWA audit not run.
- **Next:** install on the phone and report anything awkward; first real microphone session to tune thresholds; consider syncing the Diary report to Notion automatically.

## 2026-11-23 — Song Goal Mode (Codex)
- Added a goal flow to the existing GitHub Pages game: song and deadline, five to twenty daily minutes, short skill check, chord/transition/section lessons, play-along sound, self-reported and microphone check-ins, countdown, practice estimate, cram estimate, and replanning after each check-in or missed day.
- Added four source-linked chord-only starter songs. One is transposed into C for the supported ukulele shapes. For other songs, the app saves the goal and offers a ChatGPT research prompt and validated JSON import; it does not claim to have analyzed an unknown song.
- Preserved bilingual labels, paired chord visuals, Eduardo's G 2–3–1 fingering, and browser-local progress/backup. Updated the teaching rule so any title can be a chord-only goal while built-in curriculum songs retain their original constraint.
- Checks: JavaScript syntax; all starter songs parse with supported chords; headless Chromium on desktop and mobile for goal setup, check-in replanning, unknown-song import, difficult-attempt repeat, and reload persistence. Browser page errors: none in those flows.
- Unverified: real ukulele microphone accuracy, original-song tempo and strumming for starter catalog, AI-import accuracy, and automatic chord lookup for arbitrary songs. The latter needs a reliable song data service or a budget-limited AI backend.
- Next: try real instrument and phone checks; choose a capped lookup backend if one-step arbitrary-song analysis is needed.

## 2026-11-19 — First version of the game (Claude Fable 5.2)
- Built from the Notion page "Ukulele — lessons, visuals & progress" (six classes, teaching rules, resources).
- 48 doses on 8 islands, then a generated daily challenge. One new dose per day; replays are free.
- Microphone checks: tuner, single notes / strings, strum count with evenness, chord sequences. Passing recordings are kept in the Diary (this device only).
- Checks run: headless Chromium, all 48 doses render in both languages without errors; the five check types pass on synthetic audio and a wrong-chord recording is rejected.
- Unverified: the checks have not been tried with a real ukulele and a real phone microphone. Chord recognition thresholds may need tuning after the first real sessions.
- Not used: fal.ai / Higgsfield (generated hand photos risk wrong fingerings; all diagrams are exact SVG) and tldraw.
- Next: collect real-instrument feedback; consider syncing progress back to Notion.
