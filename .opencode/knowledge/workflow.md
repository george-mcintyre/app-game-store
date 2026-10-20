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

## Public repository rules

- The repository is public for reading; all rights reserved (`LICENSE`). Never merge a PR whose
  author is not `george-mcintyre`, except Dependabot's dependency updates; close outside PRs
  with a pointer to `CONTRIBUTING.md`.
- Commits here use the GitHub noreply address (repo-local `git config user.email`); never commit
  with a personal address.
- Security reports arrive through private vulnerability reporting (Security tab), not issues.
  Secret scanning, push protection, Dependabot and CodeQL default setup are on; check the
  Security tab after merges.
- Bumping `TERMS_VERSION` (`shared/src/terms.ts`) is required for any change to the terms text.

## Before a PR

- `npm run typecheck` and `npm test` green at the root.
- `npm run build -w site` succeeds.
- No secrets in tree. Worker secrets: `LINK_SECRET`, `MASTER_KEY`,
  `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` via `npx wrangler secret put`.
  Developer credentials (Apple key, GitHub token) are entered in the dashboard, never in config.

## Live check

`npm run smoke` checks the public endpoints of https://ourapps.app; with `OURAPPS_API_KEY` set to a
manage key it walks every endpoint agents.md lists on a throwaway app, compares the answers with
the documented shapes, and deletes what it made (`scripts/smoke.mjs`; `--base
http://localhost:8787` for a local run). It fails when agents.md lists an endpoint it did not
call. Run it after each deploy that touches the API, and before any public release.

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
