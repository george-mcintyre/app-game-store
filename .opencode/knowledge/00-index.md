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

## Conventions

- Every page, document and public file carries "Copyright Level N Ltd 2026" (site footers via
  `storeFrame` and `shell`, plus README, CONTRACT.md, agents.md). Keep it when adding pages.
- Public example content uses the invented "Poker Night" app, never a real app name.

## Where to change X

- Routes: `worker/src/index.ts`. Handlers: `worker/src/routes/{public,enrol,build,dev}.ts`.
- Sign-in and sessions: `worker/src/auth.ts`. Encrypted credentials: `worker/src/secrets.ts`, `worker/src/crypto.ts`.
- Approve flow (Apple register, profile recreate, dispatch): `worker/src/flow.ts`, `worker/src/apple.ts`, `worker/src/github.ts`.
- Schema: `worker/migrations/*.sql`; queries: `worker/src/db.ts`.
- Enrolment states: `shared/src/enrolment.ts`.
- Example story and mock install page: `site/src/pages/example.ts` (routes `/example`, `/example/poker-night`).
- Site pages: `site/src/pages/public.ts` (store theme: landing, developer page, install, wait, preview), `site/src/pages/dev.ts` (console: overview, apps, form, links, devices, settings, agents), `site/src/pages/guide.ts` (A to Z guide), `site/src/pages/shell.ts` (console frame), `site/src/pages/prompts.ts` (agent prompts).
- Design tokens and both themes: `site/src/style.css` (`[data-theme="store"]`, `[data-theme="dev"]`, dark variants). Placeholders: `site/src/placeholders.ts`. Shared components and icons: `site/src/ui.ts`.
- Security model and rotation: `SECURITY.md`. Crypto primitives: `worker/src/crypto.ts`; credential envelopes: `worker/src/secrets.ts`; audit log: `worker/src/audit.ts`.
- API keys and bearer auth: `worker/src/auth.ts`, `worker/src/routes/dev.ts` (`listKeys`, `createKey`, `revokeKey`, `releaseStatus`, `previewApp`).
- Agent documents: `site/public/agents.md`, `site/public/llms.txt`; `CONTRACT.md` is copied to `site/public/contract.md` by the site `prebuild` script.
- Platform and in-app browser detection: `site/src/platform.ts`. Paths: `site/src/router.ts`.

## Build, test, run

- `npm install` at the root (workspaces `shared`, `worker`, `site`).
- `npm test` runs all three; `npm run typecheck` likewise.
- Local: `cd worker && npx wrangler d1 migrations apply app-game-store --local`, then
  `npm run build -w site && npm run dev -w worker` on http://localhost:8787.
- Deploy: `npm run build -w site && cd worker && npx wrangler deploy`. See `workflow.md`.

Details: `workflow.md`, `gotchas.md`.
