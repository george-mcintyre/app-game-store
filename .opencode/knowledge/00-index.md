# app-game-store - private link-only installer

Repo: github.com/george-mcintyre/app-game-store (confirm with `git remote -v`). Public repo
because GitHub Pages on a free account needs one; privacy comes from the link being unlisted.

## What it is

A friend taps a link or QR code and ends up with an app on their home screen. No search, no
browsing. The store reads each app's `/my-app.json` (schema 1, owned by `@my:orchestrator`,
see `../../.opencode/knowledge/app-manifest.md`) and offers the install path for the
friend's platform.

## Layout

| path        | what                                                                 |
|-------------|----------------------------------------------------------------------|
| `worker/`   | Cloudflare Worker: enrolment, long poll status, build-ready, admin   |
| `site/`     | Vite + TypeScript static site, GitHub Pages, hash routes             |
| `CONTRACT.md` | what an app repo must implement (dispatch, profile, publish, build-ready) |
| `README.md` | how to add an app, share, limits                                     |

## Where to change X

- Enrolment states or transitions: `worker/src/enrolment.ts`.
- HTTP routes: `worker/src/index.ts`; Apple calls `worker/src/apple.ts`; GitHub `worker/src/github.ts`.
- Which apps the worker may rebuild (repo, profile name): `worker/apps.json`.
- Which apps the site shows: `site/public/apps.json` (list of my-app.json URLs).
- Manifest validation: `site/src/manifest.ts`. Platform and in-app browser detection: `site/src/platform.ts`.
- Install flow copy: `site/src/pages/app.ts`, `site/src/pages/wait.ts`.

## Build, test, run

- Install: `npm install` at repo root (npm workspaces: `worker`, `site`).
- Test all: `npm test`. Worker only: `npm test -w worker`. Site only: `npm test -w site`.
- Typecheck: `npm run typecheck`.
- Worker local: `npm run dev -w worker` (wrangler dev on http://localhost:8787).
- Site local: `npm run dev -w site` with `VITE_WORKER_URL=http://localhost:8787`.
- Deploy worker: `npm run deploy -w worker` (needs `npx wrangler login`).
- Deploy site: push to `main`; `.github/workflows/pages.yml` publishes to
  https://george-mcintyre.github.io/app-game-store/.

Details: `workflow.md`, `gotchas.md`.
