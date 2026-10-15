# Gotchas

- `@cloudflare/vitest-pool-workers` is deprecated; use `@cloudflare/vitest-plugin` with
  `cloudflareTest()` in `vitest.config.ts`. Tests import `env` and `exports` from
  `cloudflare:workers`, not `cloudflare:test`.
- Workers KV is eventually consistent (up to 60 s across locations). The long poll reads the
  same key repeatedly from one location, so a friend sees the change within a few seconds in
  practice, but never assume read-after-write across requests.
- Apple profiles cannot be edited: the worker deletes and recreates the Ad Hoc profile with the
  same name. Apple device slots are not freed by disabling a device; 100 per year resets only
  at membership renewal.
- Apple JSON Web Tokens must expire within 20 minutes of `iat`.
- The `.mobileconfig` must be served as `application/x-apple-aspen-config` and the device
  posts a PKCS#7 body; the worker slices the inner `<?xml ... </plist>` instead of verifying
  the signature.
- `itms-services://` links do nothing inside an app's web view (Instagram, Facebook, Gmail).
  The site shows an "open in Safari" instruction instead.
- GitHub Pages serves project sites under `/app-game-store/`; the site uses hash routes so no
  404 rewrite is needed. `vite.config.ts` sets `base`.
- `wrangler` is not installed globally; use `npx wrangler` (the workspace dev dependency).
