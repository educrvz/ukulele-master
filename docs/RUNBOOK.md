# Runbook

## Where things live

| Thing | Location |
| --- | --- |
| Live app | https://educrvz.github.io/ukulele-master/ |
| Code | https://github.com/educrvz/ukulele-master (public, branch `main`) |
| Hosting | GitHub Pages, "deploy from branch": `main`, folder `/` |
| Local folder | `~/Documents/03 Software & AI/Claude/Code/ukulele-master/ukulele-master` |
| Learner's record | Notion: *Ukulele — lessons, visuals & progress* (app docs are a sub-page) |

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
2. Merge into `main`. GitHub Pages rebuilds automatically (about one minute).
3. Open the live URL and reload once. Installed copies update themselves the next time they are opened online; a "New version ready" notice offers a reload.

## Roll back

Revert the bad commit on `main` and push:

```bash
git revert <commit>
```

```bash
git push origin main
```

Pages redeploys the previous state. Saved progress is not touched by a rollback, because it lives in each browser.

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
| None | — | — | The app has no backend, API keys or tokens. Deploying uses Edu's normal GitHub login (`gh`). |

If a paid service is ever added (for example automatic song lookup), follow Edu's limits: an expiry, least scope, and a hard cap of about US$ 2 per day, recorded in this table.
