# Workflow

## Repo identity

`git -C app-game-store remote -v` must show `github.com/george-mcintyre/app-game-store`.
Never derive the repo from the folder name.

## Branch model

- `main` is deployable; the Pages workflow runs on every push to it.
- Work on `feat/<topic>`, `fix/<topic>`, `chore/<topic>` branches. One feature per PR.
- Commit small and often, imperative subject, one line. No em dashes anywhere.
- Open PRs with `gh pr create --repo george-mcintyre/app-game-store --base main`.
- Merge with `gh pr merge --merge` (keep the small commits).

## Before a PR

- `npm run typecheck` and `npm test` green at the root.
- `npm run build -w site` succeeds.
- No secrets in tree: Apple key, admin token, build token and GitHub token live only in
  Worker secrets (`npx wrangler secret put <NAME>` in `worker/`).

## Deploy

- Worker: `npm run deploy -w worker`. First time: create the KV namespace with
  `npx wrangler kv namespace create ENROLMENTS` in `worker/` and paste the id into
  `worker/wrangler.jsonc`.
- Site: merge to `main`. Repo setting Pages > Source must be "GitHub Actions".
- Site reads the worker URL from `VITE_WORKER_URL` at build time (set in `pages.yml`).
