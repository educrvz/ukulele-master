# ADR 0002: Private Vercel app with server-side song lookup

Date: 2026-11-24

## Decision

Serve the app from the existing protected Vercel project. Add one serverless route at `/api/song` that searches for a source and returns a short chord-only arrangement. Keep the AI Gateway key in a production secret, with a 90-day expiry and a $2 daily key budget; also set a $2 daily project budget. The browser source remains buildless and dependency-free. Redirect the old public GitHub Pages URL to the protected app and transfer local progress through a URL fragment.

## Reason

The static app forced learners to leave the app and paste AI responses. Browser code cannot keep a model credential private. Vercel's existing deployment protection gives the family an access gate, and its function can call the model without exposing the key.

## Tradeoffs

- Song search requires internet; the built-in lessons and already imported plans still work offline.
- Progress remains per browser. The old address transfers localStorage state on an online visit; IndexedDB recordings stay on the old origin.
- Vercel's spend budgets are soft caps, so one request that crosses the limit can complete. The route limits each lookup to one model call, low search context and 1,200 output tokens.
- Family access requires adding each intended person to the protected Vercel project.
