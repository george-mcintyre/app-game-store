# ourapps - private link-only installer

Repo: github.com/george-mcintyre/ourapps (folder `ourapps/`; renamed from `app-game-store` on
2026-10-18, GitHub forwards the old URL). Confirm with `git remote -v`. Cloudflare resources keep
the name `app-game-store` (Worker, D1 database); see `gotchas.md`. Public repo;
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
- Terms and data statement: `site/src/pages/terms.ts`; version constant `shared/src/terms.ts` (bump to force re-acceptance); gate `requireTerms` in `worker/src/auth.ts`; acceptance stored on `developers`.
- Security model and rotation: `SECURITY.md`. Crypto primitives: `worker/src/crypto.ts`; credential envelopes: `worker/src/secrets.ts`; audit log: `worker/src/audit.ts`.
- API keys and bearer auth: `worker/src/auth.ts`, `worker/src/routes/dev.ts` (`listKeys`, `createKey`, `revokeKey`, `releaseStatus`, `previewApp`).
- Screenshots per version: storage `apps.screenshots_by_platform` (migration 0005); sets built in `buildLinkPage` (`worker/src/routes/public.ts`); choice of list `pickScreenshots` (`shared/src/screenshots.ts`); versions, tabs and shapes `site/src/views.ts`; panels and carousels in `renderInstall` (`site/src/pages/public.ts`).
- Revision history (releases, tags, commit fallback, 2 minute cache): `worker/src/history.ts`; rendering: `historyBlock` in `site/src/pages/public.ts`, notes to HTML in `site/src/notes.ts`.
- Web app hosting on `https://<linkId>.ourapps.app/`: `worker/src/webapp.ts` (host detection, limits `WEB_LIMITS`, unpack once per release into ~2 MB packs in KV `WEBAPP_FILES`, edge cache per file, `.br`/`.gz` encodings, `_headers` allowlist, SPA fallback); route `*.ourapps.app/*` in `worker/wrangler.jsonc` needs the wildcard proxied AAAA record on the zone.
- Technical reference page (public, `/reference`): `site/src/pages/reference.ts`; inline SVG architecture diagram as fallback; generated diagrams in `site/public/reference/` as PNG masters plus WebP copies (`cwebp -q 92 -m 6`), shown through `diagram()` with a full-size link; prompts in `docs/diagram-prompts.md`. The guide overview reuses `architecture`. Keep the page's limits in step with `WEB_LIMITS`.
- Agent documents: `site/public/agents.md`, `site/public/llms.txt`; `CONTRACT.md` is copied to `site/public/contract.md` by the site `prebuild` script.
- Platform and in-app browser detection: `site/src/platform.ts`. Paths: `site/src/router.ts`.

## Build, test, run

- `npm install` at the root (workspaces `shared`, `worker`, `site`).
- `npm test` runs all three; `npm run typecheck` likewise.
- Local: `cd worker && npx wrangler d1 migrations apply app-game-store --local`, then
  `npm run build -w site && npm run dev -w worker` on http://localhost:8787.
- Deploy: `npm run build -w site && cd worker && npx wrangler deploy`. See `workflow.md`.

Details: `workflow.md`, `gotchas.md`.
