# ADR 0004: Single-screen focus, live daily tuner, and quiet gamification

Date: 2026-11-26
Status: accepted

## Context

In version 3, the Today screen stacked five cards vertically (a 280 px hero banner, tuning/lesson card, song facts and cram math, check-in history, edit form, and switch-song button), duplicated itself on the Song tab, spent 80 px on a floating 4-tab bottom bar, and ran the Today tuning microphone check without rendering a live pitch needle or string indicators.

Auditing version 3 through the Signal-to-Noise lens (`Gate B`, Hick's law, Fitts's law) and adapting Edu's gamification guidelines (Calistenia QR ADR 0004) showed that every extra card and premature rating control competed with the one thing the learner came to do: tune the ukulele and play today's small step toward their song.

## Decision

- **Single-screen, zero-scroll stage (`100dvh`):** The main viewport renders one focused stage at a time — **Daily Tuner → Lesson → Post-Check-in Reward** — sized to fit a 390×844 phone with zero vertical scrolling.
- **Drop the 4-tab bottom bar:** Replace it with a slim top header (`[Song · days ▾]`, retune shortcut, `PT/EN`, and `☰` menu) and a slide-over drawer (`#sheet`) holding `Song` (roadmap, source/tempo facts, edit date/minutes, switch song), `Tools` (tuner, metronome, 1-minute changes, chord library), and `Diary` (check-ins, recordings, previous journeys, backup, report, theme, install).
- **Daily G·C·E·A visual tuner front door:** Opens automatically once per calendar day (`goal.tunedOn !== today()`), with four tappable string pads playing individual FreePats CC0 reference notes, a live pitch needle gauge (`♭` / green zone / `♯`), and an honest self-confirm link (`Already in tune →`) so tuning never hard-locks practice. Reopening the tuner anytime is one tap from the top header.
- **Side-by-side paired chord diagrams on mobile:** Keep both required teaching views (finger placement chart + player's-view sounded notes) side-by-side even at 390 px, including stacked pairs on 2-chord transitions, so no chord view is hidden and no scrolling is required.
- **Quiet gamification (adapted from Calistenia QR ADR 0004):**
  - *Action-first is sacred:* zero game clutter before playing; "I played it" reveals the 3 honest check-in options in place only when ready.
  - *No XP inflation or punitive daily streaks:* retire visible XP/fire counters in favor of a healthy `Mon–Sun` weekly rhythm target (`4 days/week`) that never resets harshly on a missed day.
  - *Endowed Progress & Zeigarnik Song Map:* a slim segmented bar under the header lights up immediately on daily tuning and shows mastered/partial/upcoming steps.
  - *Goal Gradient + Variable Micro-Reward:* after check-in, show step progress (`■ ■` / `■ □`), the exact next millimeter, and on ~35% of chord/change/section check-ins (after ≥2 check-ins) offer an optional 30-second chord-change bonus jam.
  - *Never hard-lock:* every step in the Song Roadmap inside the drawer is tappable to try anytime, while mastery still requires honest completion (`mic` kept separate from `self`).

## Consequences

- Existing `uke-master-v1` progress carries over cleanly without re-archiving (`tunedOn` and `lastBonusDate` are additive optional fields).
- All primary phone flows fit inside 390×844 with zero vertical scroll, enforced in `tests/smoke.py`.
- Deep inspection tools (song facts, history, metronome, chord library, backup) remain one tap away in the drawer without crowding daily practice.
