# Security

How developer credentials and tokens are protected, what to do on rotation, and what the design
does not cover.

## What is stored and how

| data | at rest | notes |
|---|---|---|
| Apple issuer id, key id, .p8 private key, team id, GitHub token, signing key | AES-256-GCM, one ciphertext per field | key derived per developer with HKDF-SHA256 from `MASTER_KEY`; developer id, field name and format version bound as additional authenticated data; random 96-bit nonce per write |
| API keys (`oa_` + 160 random bits) | HMAC-SHA256 keyed hash (`h2:` prefix) | pepper derived from `MASTER_KEY`; only an 11-character prefix is kept for display |
| Per-app build tokens (192 random bits) | HMAC-SHA256 keyed hash | same pepper scheme, purpose string `build-token` |
| Apple Distribution certificate (public) | plain, `signing_certificates` | its private key is the `signingKey` field above, made in the developer's browser |
| Session ids (192 random bits) | HMAC-SHA256 keyed hash | cookie `HttpOnly; Secure; SameSite=Lax`, 30 days, purpose string `session` |
| Signed download links | HMAC-SHA256 over the payload with `LINK_SECRET` | expire after one hour |
| Audit log | plain text | event name, short detail, country; never values |

`MASTER_KEY` and `LINK_SECRET` live only in Cloudflare Worker secrets. D1 is encrypted at rest by
Cloudflare; the scheme above assumes it is not and treats a copied database as useless without the
Worker secrets.

A copy of the database therefore yields no plaintext credentials, no usable API keys, build
tokens or sessions, and no way to forge any of them (forging a keyed hash needs the pepper).

## Access rules

- Credentials can be written only from a browser session (`PUT /api/dev/secrets` refuses API
  keys). They are never returned by any endpoint; the console sees presence and save dates.
- Cookie sessions refuse state-changing requests whose `Origin` is not this site.
- API keys have a scope (`read` or `manage`) and an optional expiry (default 90 days in the
  console, maximum one year). Keys cannot create or revoke keys. Every key is revocable alone
  or all at once.
- Decryption is on demand and field-level: install pages decrypt only the GitHub token; the
  Apple private key is decrypted only while setting up signing or TestFlight, brokering a
  workflow's upload, and in the ten-minute check that looks after TestFlight builds; the signing
  key only when a release workflow presents one of the developer's build tokens at
  `/api/build/<app>/signing`. A build token therefore lets its holder sign builds as that
  developer and upload them to the app's TestFlight.
- The signing key is written only by `POST /api/dev/signing` from a browser session (validated as
  a 2048-bit RSA PKCS#8 key); `PUT /api/dev/secrets` cannot set it.
- The Apple key is validated as an EC P-256 PKCS#8 key before it is stored; GitHub tokens must
  match the `github_pat_` or `ghp_` shape.
- Security events (sign-in, sign-out, credential saves and removals, signing setup, key creation
  and revocation, build token rotation, app deletion) are written to the audit log
  and shown under Settings, Security, with "Sign out everywhere" next to them.
- Every response carries HSTS (preload), a strict Content Security Policy, `nosniff`,
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, a Referrer-Policy and a
  Permissions-Policy.

## Rotating the master key

1. Generate a new value: `openssl rand -hex 32`.
2. `npx wrangler secret put MASTER_KEY_PREVIOUS` with the current value, then
   `npx wrangler secret put MASTER_KEY` with the new one. Deploy is not needed; secrets apply
   on the next request.
3. Credentials are rewrapped under the new key the first time they are read; API keys, build
   tokens and sessions are rehashed the first time they are used. Nothing stops working.
4. After every active developer has used the console once (check
   `SELECT json_extract(blob, '$.kid') AS kid, count(*) FROM developer_secrets GROUP BY kid`),
   remove the old value: `npx wrangler secret delete MASTER_KEY_PREVIOUS`. Credentials still
   under the old key id after that cannot be decrypted; their owners re-enter them.

Rotating `LINK_SECRET` only invalidates download links that are less than an hour old.

## If a credential leaks

- GitHub token: revoke it on GitHub, create a new one, paste it under Settings.
- Apple key: revoke it in App Store Connect, Users and Access, Integrations; generate a new one.
- API key: revoke it on the Agents page (or revoke all).
- Build token: rotate it on the app page and update the repository secret. If it may have been
  used, also replace the certificate under Settings and revoke the old one in the Apple developer
  portal (installed builds signed with it stop opening; publish a new release first).
- Suspected account takeover: Settings, Sign out everywhere; Agents, Revoke all keys; then
  rotate the two external credentials above.

## Not covered

- Compromise of the Cloudflare account or of GitHub sign-in itself.
- A malicious developer: each developer only ever sees their own rows, but the service trusts
  Cloudflare and GitHub for identity.
- Secrets in Worker memory during a request; the runtime does not offer zeroisation.
- Brute force against sign-in is bounded by GitHub; against API keys it is bounded by 160 bits.
  No per-IP rate limit is applied on the free tier.

## Reporting a vulnerability

Report it privately at https://github.com/george-mcintyre/ourapps/security/advisories/new
(GitHub's private vulnerability reporting: only the maintainer sees it). Do not open a public
issue for a security problem, and do not include real secrets or personal data in any report.
Expect a reply within a few days; fixes are released before details are published.
