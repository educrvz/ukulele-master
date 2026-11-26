# Context

## What and who

Ukulele Master is a personal practice game for Eduardo (Edu), a beginner learning ukulele in short daily sessions. Family may use it too. It is not a commercial product.

The Notion page *Ukulele — lessons, visuals & progress* holds Edu's earlier teaching rules and history. The app stores new song check-ins on the device; they are not automatically synchronized to Notion.

## Product shape

- **Single-screen stage:** song and target date first, then a daily GCEA live tuner (once per calendar day, reopenable anytime), one-screen song lessons with side-by-side paired diagrams, and a quiet post-check-in reward screen (goal-gradient pips, next step, 4-days/week rhythm, optional ~35% 30-second chord-change bonus).
- **Slide-over drawer (`Song · Tools · Diary`):** tucks secondary controls off the practice canvas — song facts, deadline forecast, tappable roadmap (never hard-locked), date/minutes editor, standalone tuner, metronome, 1-minute chord-change game, chord library, check-in log, recordings, previous-journey archive, report/backup export, theme, and install.
- **Original course:** the 48-dose curriculum remains in `js/data.js` for reference; existing pre-v3 learner state is archived in `previousJourneys`.

## Architecture

Plain HTML, CSS and JavaScript served as static files from Vercel, with Vercel Functions for song suggestions and chord lookup. No build step, framework or analytics. Vercel deployment protection restricts access to invited team members. The former GitHub Pages URL redirects to Vercel and carries saved local progress in a URL fragment.

- Scripts are classic `<script>` tags that attach to `window` (`UKE`, `DG`, `DSP`, `Snd`, `Player`, `Mic`, `RecStore`, `UI`, `PWA`, `SongGoal`). Load order in `index.html` matters.
- Views are functions in `js/app.js` that return HTML strings; one delegated click handler dispatches `data-act` attributes to the `A` action table. Song Goal uses `data-goal-act`.
- Sound uses the bundled CC0 FreePats ukulele recordings through Web Audio, with a labeled synthetic fallback. Microphone checks use pitch detection, onset detection and chroma matching from `js/dsp.js`.
- A service worker (`sw.js`) precaches the app and recorded samples, serves static files network-first, and bypasses `/api/` requests so dynamic search does not become stale.
- `api/search.js` looks up song titles and artists in a public Ultimate Guitar chord index, deduplicates charts, and returns clickable suggestions. The learner must select one before saving a goal. `api/song.js` then extracts short chord sequences from sourced charts on the server and transposes them into supported ukulele shapes; it never returns lyrics. If no usable chart is found, it tries `openai/gpt-5-mini` through Vercel AI Gateway with web search and accepts an explicit “no reliable source” answer. The gateway key is a Vercel production secret. The daily $2 gateway key and project budgets constrain spending. Direct chord search has no model charge.

## Data (all on the device)

| Where | Key | Holds |
| --- | --- | --- |
| localStorage | `uke-master-v1` | `lang`, `onboarded`, `goal` (song, mastery, check-in history), `journeyVersion`, `journeyStartedAt`, `previousJourneys`, `theme`; legacy `doses`, `log`, `xp`, `changes` are archived during migration |
| localStorage | `uke-install-dismissed` | whether the install banner was closed |
| IndexedDB | `uke-master` / `rec` | up to 30 microphone recordings |

Evidence levels: `mic` (verified by the microphone) and `self` (self-reported). Tuning check-ins do not count toward song mastery. The old `placement` level remains only in archived journeys.

## Known gaps

- Microphone thresholds are untested on a real ukulele and phone.
- No sync between devices or back to Notion (manual report / backup only).
- Automatic song search needs a network connection and a reliable source. The app shows a retry when analysis cannot find one; it does not accept pasted AI output.
