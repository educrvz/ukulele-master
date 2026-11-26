# Ukulele Master

Choose a song and a date, then learn the ukulele from the beginning through short lessons that lead toward that song. The plan adapts after every check-in. English and Brazilian Portuguese are supported.

**Play it:** <https://ukulele-master-two.vercel.app/> — Vercel sign-in required. The app can be installed on a phone and the starter songs work offline.

<p>
  <img src="docs/screenshots/home.png" alt="Three Little Birds goal and the tuning step at the start of class" width="260">
  <img src="docs/screenshots/lesson-dark.png" alt="First song lesson in dark mode" width="260">
</p>

## How it works

1. Type a song or artist, choose a suggestion, pick a target date and daily practice time. “Three Little Birds” is a ready-to-play starter song.
2. Start each class by tuning G, C, E and A. The microphone check is optional; manual confirmation is labeled as self-reported.
3. Follow the next lesson: holding the instrument, open strings, rhythm, song chords, changes, sections and a beginner playthrough.
4. Check in after playing. The app updates mastery, the next lesson and the deadline forecast. A hard attempt keeps the step ready for more practice.

The play-along uses a recorded CC0 ukulele bank from [FreePats](https://github.com/freepats/ukulele1), bundled locally for offline use. If sample loading fails, the app labels the synthetic backup. Chord-only song arrangements link to their sources; some are beginner excerpts and are labeled that way. A song and artist search needs a network connection.

Progress and recordings stay in this browser. The first visit to version 3 archives the old fixed-course progress on this device and starts the song setup again. Diary shows the current song's check-ins, lists previous journeys and earlier recordings, and can export or import a JSON progress backup. Audio recordings remain on this device and are not included in the JSON backup.

## Install and run

On iPhone, open the live link in Safari and use Share → Add to Home Screen. On Android Chrome, use the Install prompt or browser menu. Sign in to Vercel before installing. The former GitHub Pages address redirects to the protected app and transfers browser progress in the URL fragment; microphone recordings do not transfer.

To run locally, serve the repo root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then visit <http://127.0.0.1:8765/>. The static site has no build step or npm dependencies. The server-side `/api/search` and `/api/song` routes run on Vercel, so local song search needs a mocked route or Vercel dev.

## Test

With the local server running:

```bash
python3 tests/smoke.py
node tests/song-api.test.js
node tests/listening.test.js
```

The smoke test covers first-run song selection, “Three Little Birds,” session tuning, adaptive check-ins, history migration, both languages, recorded audio, and offline load. Microphone recognition still needs calibration with a real ukulele and phone.

## Code and documentation

- `js/song-goal.js`: song setup, foundation and song lessons, tuning gate, check-ins and planning.
- `js/audio.js` and `audio/ukulele/`: recorded sound, sample playback and fallback. License and provenance are in the audio folder.
- `js/app.js`: views, navigation and local migration under the unchanged `uke-master-v1` key.
- `api/search.js`, `api/song.js`, `lib/chord-source.js`: server-side suggestions and source-linked chord lookup, with a capped AI fallback. The key is never sent to the browser.
- `sw.js`: offline shell and sample cache; dynamic API requests bypass it.
- [Context](docs/CONTEXT.md), [runbook](docs/RUNBOOK.md), [decisions](docs/decisions/), [progress log](PROGRESS.md).
- Private Notion pages: [learner's record](https://app.notion.com/p/417eeae1044a8102acf7dc2bdce60a7a) and [app guide](https://app.notion.com/p/421eeae1044a8113b377fd6bcdeb3c94).

The [GitHub repository](https://github.com/educrvz/ukulele-master) is public. The live Vercel app is protected by sign-in. Browser-local usage and recordings are not part of the repository.
