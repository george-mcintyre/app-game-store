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
- Cookie sessions refuse writes whose `Origin` differs from `PUBLIC_ORIGIN` (localhost origins
  allowed when `PUBLIC_ORIGIN` is localhost). API keys (`oa_...`) skip that check and cannot
  create or revoke keys.
- Grid children need `min-width: 0` or a long URL widens the page on phones; `style.css`
  sets it for `.stack`, `.grid-2`, `.grid-3` and the card layouts. Keep that in mind for new
  grids.
- Desktop Chrome will not open a window narrower than about 500 px, so headless screenshots
  at phone widths lie; use `npx playwright screenshot --channel chrome --viewport-size=390,844`.
- `site/public/contract.md` is generated (gitignored); edit `CONTRACT.md` at the root.
- Credentials: one ciphertext per field (`worker/src/secrets.ts`, format 2 with `kid`). Token
  hashes carry the `h2:` prefix and are peppered from `MASTER_KEY`; verification also tries
  `MASTER_KEY_PREVIOUS` and plain SHA-256, rewriting on match. Never compare a token against a
  stored hash without going through `hashMatches`.
- `PUT /api/dev/secrets` and key management are session-only; tests that need credentials must
  sign in with a cookie, not an API key.
