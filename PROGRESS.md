# Progress log

## 2026-11-24 — Private in-app song lookup and Gemini import fix (Codex)
- **Changed:** Unknown song goals search for a trustworthy chord source inside the app through a server-side Vercel AI Gateway route and build the existing adaptive practice plan. The manual importer now accepts corrected song spelling and Markdown-formatted source URLs such as Edu's Gemini response. Errors distinguish a title mismatch from malformed JSON or chords. The former public GitHub Pages address redirects to the protected Vercel app and transfers local practice state in a URL fragment.
- **Why:** Edu's "Three Little Birds" response failed because his typed title differed after correction and Gemini produced Markdown URL syntax with invalid JSON escapes. Copying prompts between apps was too cumbersome.
- **Credentials:** 90-day AI Gateway key, production secret only; $2/day key and project budgets, 50/75/100% alerts on the key. No automatic top-up. See RUNBOOK for scope, expiry and rotation.
- **Checks:** `python3 tests/smoke.py` passed, including the pasted Gemini case, an in-app lookup response, and offline mode; `node tests/song-api.test.js` passed. Live search and private access still need verification on the deployed Vercel URL.
- **Unfinished:** Verify Vercel preview/production, confirm a real source result for Three Little Birds, update the Notion app guide, and add Edu's named family accounts when supplied. Old-origin IndexedDB recordings do not transfer.

## 2026-11-23 — Microphone no longer counts noise or talking (Claude Code)
- **Problem (reported by Edu with a screen capture):** dose 6 reached 16/16 strums with nobody playing; the tuner needle also moved on its own.
- **Root cause:** `DSP.OnsetDetector` used a fixed threshold. Steady room noise changes from frame to frame by about a quarter of its own energy, which is right at the old 0.3 threshold, so any room louder than a very low fixed gate (rms 0.006) produced about five "strums" a second. Nothing checked that a sound was a ukulele, so talking counted too. The tuner accepted any single frame with a pitch.
- **Fix:** (1) the onset threshold adapts to the room: a sound must rise well above the last second's typical change and above the tracked background level; (2) a strum only counts after the next tenth of a second confirms it keeps ringing and matches the lesson's chord (`check.chords`, filled from each dose's `demo.seq`); chord-sequence checks have the same minimum match; (3) the tuner needs several frames that agree within a quarter of a semitone. Added a microphone level bar with the room's background marker, and an "ignored N other sounds" line.
- **Checks:** new `node tests/listening.test.js` (31 checks, synthetic noise, hum, taps, voice, strums, all 17 chords, every chord-sequence lesson, tuner). New `tests/fake-mic.py` replays a WAV as the microphone in headless Chromium: Edu's capture audio gave **16/16 on the old code and 3/16 on the fixed code** (57 sounds ignored). `tests/smoke.py` 26/26.
- **Deployed:** pull request 2 merged into `main` on 2026-11-23 (99a086a); GitHub Pages build succeeded. Against the live site: `tests/smoke.py` 26/26, and the capture audio through `tests/fake-mic.py` gave 4/16 with 57 ignored (it was 16/16 before; the count varies by one between runs). Notion app guide change history updated (2.0.1).
- **Known limits:** about 3 stray counts per 30 s of continuous talking (a voice pitched on a chord note looks like the chord). A voice as loud as the ukulele on top of a strum can hide that strum, so the check now says to count in your head.
- **Unverified:** thresholds are tuned on synthetic strings, not a real ukulele. `CHORD_MIN` (0.72) in `js/mic.js` is the first number to adjust if real strums are missed. To calibrate: record real strumming to a WAV and run `tests/fake-mic.py`, or `node tests/lib/trace.js recording.wav` to see each candidate's score.

## 2026-11-23 — Vercel address corrected, folder flattened (Claude Code)
- **Changed:** docs now give the real Vercel address, https://ukulele-master-two.vercel.app/ (commit a8e0ab7). The first version of the docs said `ukulele-master.vercel.app`, which belongs to someone else. The local repo was moved up one level, so it is now `~/Documents/03 Software & AI/Claude/Code/ukulele-master`.
- **Why:** the wrong address would have sent readers to a stranger's site; the doubled folder was confusing.
- **Checks:** `tests/smoke.py` 26/26 against the Vercel address; `git status` clean and in sync with `origin/main` after the move.
- **Unfinished:** Edu still has to approve Notion's GitHub connection inside Notion if he wants rich repo previews. Real-phone install and real-ukulele microphone checks remain untried.

## 2026-11-23 — Linked GitHub, Vercel, Notion and the local folder (Claude Fable 5.2)
- **GitHub repo settings:** website set to the live Pages link, new description, topics (ukulele, pwa, music-education, web-audio, vanilla-javascript, portuguese).
- **Vercel:** project `ukulele-master` created in team `educrvzs-projects` with the CLI (the Vercel connector returned 403 on create) and connected to the GitHub repo. `main` deploys to production; branches and pull requests get preview links. Hobby plan, nothing billable, no tokens created.
- **Notion ↔ GitHub:** README and RUNBOOK link to the two Notion pages; the Notion app guide links to the repo, pull request, Vercel and the docs files.
- **Local folder:** flattened from `ukulele-master/ukulele-master` to `ukulele-master` (see the RUNBOOK path).
- **Note:** progress is saved per web address, so Pages and Vercel do not share it. Pages stays the address to install.
- **Unverified / needs Edu:** Notion's own GitHub connection (rich previews of repo links) must be approved by Edu inside Notion; it cannot be done from here.

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
