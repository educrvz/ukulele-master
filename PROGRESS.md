# Progress log

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
