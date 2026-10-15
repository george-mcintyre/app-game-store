# app-game-store (product name ourapps) - private link-only installer

Repo: github.com/george-mcintyre/app-game-store (confirm with `git remote -v`). Public repo;
privacy comes from unlisted share links, not from the code being hidden. Product definition:
`../../.opencode/knowledge/ourapps.md`.

## What it is

Developers sign in with GitHub, add apps, and create share links. A friend taps `/l/<id>`
and ends up with the app on their home screen. The store reads each app's `my-app.json`
(schema 1, owned by `@my:orchestrator`, see `../../.opencode/knowledge/app-manifest.md`)
from the latest GitHub Release and serves artefacts through signed one-hour links.

## Layout

| path          | what                                                              |
|---------------|-------------------------------------------------------------------|
| `worker/`     | Cloudflare Worker: serves `site/dist`, `/api/*`, `/dl/*`; D1 data |
| `site/`       | Vite + TypeScript, no framework, history routing                  |
| `shared/`     | `validateManifest`, enrolment state machine                       |
| `CONTRACT.md` | what an app repo implements (dispatch, profile, publish, build-ready) |

## Where to change X

- Routes: `worker/src/index.ts`. Handlers: `worker/src/routes/{public,enrol,build,dev}.ts`.
- Sign-in and sessions: `worker/src/auth.ts`. Encrypted credentials: `worker/src/secrets.ts`, `worker/src/crypto.ts`.
- Approve flow (Apple register, profile recreate, dispatch): `worker/src/flow.ts`, `worker/src/apple.ts`, `worker/src/github.ts`.
- Schema: `worker/migrations/*.sql`; queries: `worker/src/db.ts`.
- Enrolment states: `shared/src/enrolment.ts`.
- Site pages: `site/src/pages/public.ts` (landing, developer page, install, wait), `site/src/pages/dev.ts` (dashboard).
- Platform and in-app browser detection: `site/src/platform.ts`. Paths: `site/src/router.ts`.

## Build, test, run

- `npm install` at the root (workspaces `shared`, `worker`, `site`).
- `npm test` runs all three; `npm run typecheck` likewise.
- Local: `cd worker && npx wrangler d1 migrations apply app-game-store --local`, then
  `npm run build -w site && npm run dev -w worker` on http://localhost:8787.
- Deploy: `npm run build -w site && cd worker && npx wrangler deploy`. See `workflow.md`.

Details: `workflow.md`, `gotchas.md`.
