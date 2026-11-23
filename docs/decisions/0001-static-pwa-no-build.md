# 0001 — Static PWA with no build step

Date: 2026-11-23 · Status: accepted

## Decision

Ukulele Master stays a set of plain static files (HTML, CSS, classic JavaScript) on GitHub Pages. Version 2 adds a web manifest and a service worker so it installs on a phone and works offline, instead of moving to a framework, a bundler or an app store.

## Why

- One learner, one device at a time, no accounts: there is nothing a server would do.
- No build step means any model or person can change a file and see it by reloading. Nothing to install, nothing to break in six months.
- GitHub Pages is free, already set up, and gives a stable URL.
- A PWA (Progressive Web App) gives the phone experience asked for (home-screen icon, full screen, offline) with two small files.

## Service worker strategy

Network-first for our own files, with a 3.5-second timeout and a cache fallback; cache-first for Google Fonts; everything precached at install.

Cache-first would be faster but needs a version bump on every deploy, and forgetting it leaves the learner on stale code with no obvious fix. Network-first cannot go stale while online, and the app is small enough that the cost is not noticeable.

## Consequences

- Progress stays in the browser's localStorage. No sync; backup is manual (Diary → Export).
- Every file the app loads must be listed in `SHELL` in `sw.js`.
- The saved-progress key `uke-master-v1` and the Pages URL must not change, or the learner loses progress.
- Features that need secrets or paid APIs (automatic song lookup) are out until a capped backend is chosen in a new decision record.
