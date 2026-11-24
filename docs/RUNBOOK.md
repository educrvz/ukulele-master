# Runbook

## Where things live

| Thing | Location |
| --- | --- |
| Live app (the one to use and install) | https://ukulele-master-two.vercel.app/ (Vercel sign-in required) |
| Code | https://github.com/educrvz/ukulele-master (public, branch `main`) |
| Main hosting + branch previews | Vercel project `ukulele-master` in team `educrvzs-projects`, connected to the GitHub repo; deployment protection enabled |
| Old public address | https://educrvz.github.io/ukulele-master/ redirects to the private app, transferring local progress in a URL fragment |
| Local folder | `~/Documents/03 Software & AI/Claude/Code/ukulele-master` |
| Learner's record | Notion: [Ukulele — lessons, visuals & progress](https://app.notion.com/p/417eeae1044a8102acf7dc2bdce60a7a) |
| App guide in Notion | [Ukulele Master app — guide & documentation](https://app.notion.com/p/421eeae1044a8113b377fd6bcdeb3c94) |

### Progress when moving addresses

Saved progress belongs to the web address it was made on. Opening the old GitHub Pages address online redirects to Vercel with the saved `uke-master-v1` state in the URL fragment. Vercel imports it if no state exists there; if there is already state, it asks before replacing it. The source copy remains on the old address. IndexedDB microphone recordings do not transfer. Preview deployments have their own origin and local progress.

### Vercel settings

- Framework: none (static files plus `api/song.js`; no build command, output is the repository root).
- Production branch: `main`. Every push to `main` deploys to production; other branches get preview deployments.
- Plan: Hobby. AI Gateway key and project budgets are each $2/day, with 50/75/100% key alerts. These are soft caps; a crossing request may finish. Do not enable automatic top-ups or overage.
- Song lookup: `lib/chord-source.js` searches a public chord chart and keeps only short chord sequences and the source URL. `api/song.js` tries the model only if that source path fails. The selected paid model returned 403 on the current free AI Gateway tier; do not buy credits without Edu's approval. Direct source lookup has no model charge.
- Access: Vercel deployment protection with SSO `deploymentType: all`, covering production and previews. An unauthenticated production request must return a sign-in redirect (HTTP 302), never the app HTML. Only Edu is currently a team member. Add only his named family members after he supplies their accounts. The GitHub Pages address is a public redirect only.
- `.vercel/` (local link file) is git-ignored. Re-link a fresh clone with `vercel link --yes --project ukulele-master --scope educrvzs-projects`.

## Run locally

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/. The service worker also runs on localhost, so after changing files reload twice, or tick "Update on reload" in the browser's developer tools (Application → Service Workers).

## Test

```bash
python3 tests/smoke.py
```

Must end with "All checks passed." It needs the local server above and Python Playwright with Chromium. It never opens a visible window.

## Deploy

1. Work on a branch, run the smoke test, open a pull request.
2. Merge into `main`. Vercel deploys the static files and the function; GitHub Pages updates its redirect.
3. Open the protected live URL and test a song lookup. Installed copies update themselves the next time they are opened online; a "New version ready" notice offers a reload.

## Roll back

Revert the bad commit on `main` and push:

```bash
git revert <commit>
```

```bash
git push origin main
```

Vercel and Pages redeploy the previous state. Saved progress is not touched by a rollback, because it lives in each browser.

## Force every device to drop its cached files

Only if a broken file got cached. Change the `CACHE` name in `sw.js` (for example `uke-master-shell-v3`) and deploy. Old caches are deleted when the new worker activates.

## Change the app icon

Edit `icons/icon.svg`, then:

```bash
python3 tools/make-icons.py
```

## Secrets and credentials

| Credential | Scope | Expiry | Notes |
| --- | --- | --- | --- |
| `AI_GATEWAY_API_KEY` (key ID `uOZwbMCBrfoey3IkBJmp9q0TvytDWZLLrPYPc23MymX45t8D`) | Vercel AI Gateway, team `educrvzs-projects`, production secret in project `ukulele-master`; no browser access | 2027-02-22 (90 days from creation) | $2/day key budget, 50/75/100% alerts; $2/day project budget. Renew with a new 90-day key, replace the production secret, deploy, then revoke the old key. Never commit the value. |

The key cannot be scoped to a single project by Vercel; the production secret and the additional project budget constrain this app. Check budgets with `vercel --scope educrvzs-projects ai-gateway budgets list --json`. To revoke the key: `vercel --scope educrvzs-projects ai-gateway api-keys revoke uOZwbMCBrfoey3IkBJmp9q0TvytDWZLLrPYPc23MymX45t8D --yes`.
