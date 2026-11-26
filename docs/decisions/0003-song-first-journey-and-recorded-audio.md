# ADR 0003: Song-first journey and recorded ukulele audio

Date: 2026-11-26
Status: accepted

## Context

Edu's fixed 48-dose course did not build a useful path to “Three Little Birds.” He wants to restart from the beginning, choose a song and target date first, tune at the start of each class, and hear a natural ukulele sound. He approved a free recorded sample bank.

## Decision

- The main route begins with song/artist selection, date and daily minutes. The old course is no longer the main curriculum. The first lessons teach holding the instrument, open strings and a downstrum before song chords, changes, sections and a playthrough.
- Tuning is a per-browser-session checkpoint before each class, separate from song mastery. A microphone result is recorded as verified only when the existing tuner recognizes the strings. Manual confirmation is available and marked as self-reported.
- Preserve `uke-master-v1`; on first version 3 load, archive the prior goal and course state in `previousJourneys` and start the new setup. Preserve IndexedDB recordings under Previous journeys in Diary, outside the current song recordings. Export includes the archived state.
- Use the CC0 FreePats ukulele bank as the default demonstration instrument. Bundle compressed MP3 assets in the PWA cache. Keep the existing synthesizer as a labeled fallback if any sample fails to load. The recorded body tap drives the metronome click, and the recorded chuck is used when the pattern calls for it.
- The browser recalculates the deterministic plan from the current mastery, date and available minutes on every check-in. Sourced chord arrangements have an explicit excerpt label unless completeness is known. Dynamic API requests bypass the service-worker cache.

## Consequences

The first visit to version 3 asks every existing browser user to select a song again, but their previous state is recoverable in Diary export. Recordings are device-local. The 13 samples add about 600 KiB to the offline installation. Song search still requires network and a reliable chart. The app does not claim exact reproduction of the complete recording when a chord extract is short or clipped. Real ukulele microphone calibration and subjective listening on Edu's phone remain follow-up checks.
