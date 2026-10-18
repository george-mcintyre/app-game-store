# Workflow

## Repo identity

`git -C ourapps remote -v` must show `github.com/george-mcintyre/ourapps`.
Never derive the repo from the folder name.

## Branch model

- `main` is deployable. Deploy is manual: `wrangler deploy` from a clean `main`.
- Work on `feat/<topic>`, `fix/<topic>`, `chore/<topic>` branches. One feature per PR.
- Commit small and often, imperative subject, one line. No em dashes anywhere.
- Open PRs with `gh pr create --repo george-mcintyre/ourapps --base main`.
- Merge with `gh pr merge --merge` (keep the small commits).

## Before a PR

- `npm run typecheck` and `npm test` green at the root.
- `npm run build -w site` succeeds.
- No secrets in tree. Worker secrets: `LINK_SECRET`, `MASTER_KEY`,
  `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` via `npx wrangler secret put`.
  Developer credentials (Apple key, GitHub token) are entered in the dashboard, never in config.

## Deploy

1. `npm run build -w site`.
2. `cd worker`; first time: `npx wrangler kv namespace create WEBAPP_FILES` and paste the id
   into `wrangler.jsonc`; `npx wrangler d1 create app-game-store` and paste the id into
   `wrangler.jsonc`; then `npx wrangler d1 migrations apply app-game-store --remote`. The D1
   database and the Worker keep the name `app-game-store` after the repository rename.
3. `npx wrangler deploy`.
4. `PUBLIC_ORIGIN` in `wrangler.jsonc` must equal the live origin; the GitHub OAuth App
   callback must be `<PUBLIC_ORIGIN>/api/auth/callback`.

## Schema changes

Add a new numbered file under `worker/migrations/`; never edit an applied one. Tests apply
all migrations to a fresh D1 before each file runs.
