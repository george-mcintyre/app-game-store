# Gotchas

- `@cloudflare/vitest-pool-workers` is deprecated; this repo uses `@cloudflare/vitest-plugin`
  with `cloudflareTest()` and `readD1Migrations` in `worker/vitest.config.ts`. Tests import
  `env` from `cloudflare:workers` and `applyD1Migrations` from `cloudflare:test`.
- Handlers take `deps` (`fetch`, `now`, `sleep`) so tests stub Apple, GitHub and time
  without network; see `worker/test/helpers.ts`.
- The session cookie only works because the site and `/api` share one origin. Do not move
  the site to another host (GitHub Pages) without switching to bearer tokens.
- Apple profiles cannot be edited: the worker deletes and recreates the Ad Hoc profile with
  the same name. Device slots are not freed by disabling a device; 100 per membership year.
- Apple JSON Web Tokens must expire within 20 minutes of `iat` (the worker uses 10).
- The `.mobileconfig` is served as `application/x-apple-aspen-config`; the device posts a
  PKCS#7 body and the worker slices the inner `<?xml ... </plist>` instead of verifying it.
- `itms-services://` links do nothing inside an app's web view (Instagram, Facebook, Gmail).
  The install page shows an "open in Safari" instruction; WhatsApp is the exception.
- Developer slugs may not collide with `api`, `dl`, `dev`, `l` (see `RESERVED_SLUGS`).
- `latestProfile` orders by `created_at, rowid` because two profiles can share a timestamp.
- `wrangler` is not installed globally; use `npx wrangler` inside `worker/`.
- GitHub Pages on a private repo needs a paid plan; this repo is public for that reason
  even though Pages is no longer used.
