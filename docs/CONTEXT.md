# Context

## What and who

Ukulele Master is a personal practice game for Eduardo (Edu), a beginner learning ukulele in five-minute daily sessions ("doses homeopáticas"). Family may use it too. It is not a commercial product.

The lessons themselves are planned and logged in Notion, on the page *Ukulele — lessons, visuals & progress*. That page is the source of truth for what Edu has actually practised and for the teaching rules. This app is the daily practice tool; its Diary can copy a progress report to paste back into Notion.

## Product shape

- **Journey:** 48 doses on 8 islands, one new dose per day, then a generated daily challenge. Replays are always free.
- **Lesson:** Look (1 minute) → Play (4 minutes, with play-along sound, metronome and timer) → Prove (microphone check or self-report).
- **Song Goal Mode:** a song plus a target date becomes a backward plan of tiny lessons, replanned after each check-in. PRD (Product Requirements Document) in Notion: *PRD — Song Goal Mode*.
- **Practice room:** tuner, metronome, one-minute chord-change game, chord library.
- **Diary:** streak, calendar, recordings, log, report, backup, appearance, install.

## Architecture

Plain HTML, CSS and JavaScript served as static files from Vercel, with one Vercel Function for song search. No build step, framework or analytics. Vercel deployment protection restricts access to invited team members. The former GitHub Pages URL redirects to Vercel and carries saved local progress in a URL fragment.

- Scripts are classic `<script>` tags that attach to `window` (`UKE`, `DG`, `DSP`, `Snd`, `Player`, `Mic`, `RecStore`, `UI`, `PWA`, `SongGoal`). Load order in `index.html` matters.
- Views are functions in `js/app.js` that return HTML strings; one delegated click handler dispatches `data-act` attributes to the `A` action table. Song Goal uses `data-goal-act`.
- Sound is synthesised with the Web Audio API. Microphone checks use pitch detection, onset detection and chroma matching from `js/dsp.js`.
- A service worker (`sw.js`) precaches every file and serves network-first, so the app works offline and still picks up deploys.
- `api/song.js` first searches public Ultimate Guitar chord charts through `lib/chord-source.js` and extracts short chord sequences on the server; it never returns lyrics. If no usable chart is found, it can try Vercel AI Gateway with web search. The gateway key is a Vercel production secret. The daily $2 gateway key and project budgets constrain spending. The paid model fallback currently needs AI Gateway credits; direct chord search works without them.

## Data (all on the device)

| Where | Key | Holds |
| --- | --- | --- |
| localStorage | `uke-master-v1` | `lang`, `onboarded`, `doses` (id → date + evidence level), `log` (sessions), `xp`, `newOn` (date of the last new dose), `goal` (song goal), `changes` (chord-change records), `theme` |
| localStorage | `uke-install-dismissed` | whether the install banner was closed |
| IndexedDB | `uke-master` / `rec` | up to 30 microphone recordings |

Evidence levels: `mic` (verified by the microphone), `self` (self-reported), `placement` (said he already knew it at onboarding). These must never be merged.

## Known gaps

- Microphone thresholds are untested on a real ukulele and phone.
- No sync between devices or back to Notion (manual report / backup only).
- Automatic song search needs a network connection and a reliable source; manual chord-only import remains available if it cannot find one.
