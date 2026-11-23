# Ukulele Master

A static, bilingual (English / Brazilian Portuguese) daily-dose ukulele game, hosted on GitHub Pages. No build step, no backend.

## Run and test
- Serve: `python3 -m http.server 8765` in this folder, then open `http://127.0.0.1:8765/`.
- `?date=YYYY-MM-DD` overrides "today" for testing the one-dose-per-day gate.
- Deploy: push to `main`; GitHub Pages serves the repository root.

## Layout
- `js/data.js`: chords and the 48-dose curriculum (all text in `B(en, pt)` pairs).
- `js/diagrams.js`: SVG chord chart, player's-view neck with sounded notes, strum patterns.
- `js/dsp.js`: pure pitch / chroma / onset functions. `js/mic.js`: microphone checks and recordings (IndexedDB).
- `js/audio.js`: synthesised demo sound and play-along. `js/app.js`: views, progress (localStorage key `uke-master-v1`).

## Teaching rules (from the learner's Notion home page)
- One small idea per dose: about 1 minute looking, 4 minutes playing.
- Every note or chord shows letter + Portuguese name: `A (Lá)`, `Am (Lá menor)`.
- Every chord shows both views: finger placement and the note each string sounds; say whether repeated names are the same pitch or an octave apart.
- G (Sol maior) uses the learner's fingering 2–3–1. Standard high-G tuning, right-handed.
- Keep evidence honest: `mic` (verified by microphone) is distinct from `self` (self-reported). Never mark mastery from silence.
- Built-in curriculum songs remain public domain or original. Song goals may use any title, but store chord symbols and short section sequences only, with a source link; do not copy lyrics or full third-party chord sheets into the app.
