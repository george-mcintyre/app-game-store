# ourapps.app for agents

ourapps.app is a private installer: developers register apps they built for friends and family, create share links, and friends install from those links. This document is the complete reference for driving it programmatically. Everything the web console does is available through this API.

Base URL: `https://ourapps.app`. All request and response bodies are JSON. Errors are `{"error": "message"}` with a 4xx or 5xx status.

Related: the repository contract at `https://ourapps.app/contract.md` describes what an app's GitHub repository must publish and the calls its workflow makes.

## Authentication

Send `Authorization: Bearer <api key>` on every `/api/dev/*` request. Keys start with `oa_` and are created by the developer in the console at `/dev/agents`. A key acts as that developer within its scope; everything is scoped to their apps and links.

- Scope `manage` allows every method; scope `read` allows only GET and returns 403 `this API key is read-only` otherwise.
- Keys may carry an expiry (default 90 days when created in the console); an expired or revoked key gets 401.
- A key can never create or revoke keys, change credentials (`PUT /api/dev/secrets`), or sign out sessions. Those need the developer in a browser.
- Keys are stored as keyed hashes; treat yours as a password and never write it to a file or a log.

Check who you are:

```
GET /api/dev/me
-> { "developer": { "id", "slug", "displayName", "githubLogin", "createdAt" }, "authVia": "key",
     "secrets": { "github": true, "githubSavedAt": "...", "apple": false, "appleSavedAt": null, "appleTeamId": "", "appleTeamIdSavedAt": null } }
```

`secrets.github` false means the developer has not saved a GitHub token; the console cannot read private release assets or ask for fresh builds until they do (only they can do that, at `/dev/settings`). `secrets.apple` false means TestFlight cannot be set up.

## Supported app types (summary)

Full detail: https://ourapps.app/reference.

- Native iPhone and iPad through TestFlight (an App Store-signed .ipa that the workflow uploads through ourapps; friends install with Apple's TestFlight app from an invitation link), native Android (signed universal .apk; no .aab), and anything that compiles to those (Flutter, React Native, .NET MAUI, Capacitor, Kotlin Multiplatform, Unity and Godot mobile).
- Static web apps and web games: the release workflow deploys the build to the developer's own free Cloudflare account (`npx wrangler deploy`, files only, with repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`) and writes the address into `install.pwa`; contract.md "Web apps" has the exact files and steps. ourapps links to it and never proxies it. A release asset named `web.zip` is served by ourapps on `https://<linkId>.ourapps.app/` and counts against ourapps' shared allowance, so deploy web apps to the developer's Cloudflare account.
- Web apps needing a server: host them yourself and put their URL in `install.pwa`.
- Backends, APIs and databases are never hosted by ourapps; apps call them directly. Allow the web app's address in CORS and authenticate with tokens, not cookies.

## Free services for the app's backend

https://ourapps.app/free-tiers.md lists services whose free plans fit apps with a few dozen users (realtime servers, video calls, databases, sign-in, AI, notifications, email, maps, analytics, builds, hosting), each with limits, catches, setup steps and secret names. Re-check the linked source before relying on a number. A developer's personal AI subscription (Claude, ChatGPT, Gemini, Copilot) must never be used to serve the app's users.

## What the developer must do themselves

Tell the developer plainly when a task is theirs; do not try to work around it:

- Signing in with GitHub, and creating the GitHub fine-grained token and the Apple App Store Connect API key (saved at `/dev/settings`; there is no API for credentials).
- iPhone signing, which runs by itself when the Apple key is saved ("Set up iPhone signing" at `/dev/settings#signing` if it did not finish), saving the TestFlight review contact at `/dev/settings#review-contact`, and adding each iPhone app once in App Store Connect (Apple has no API for it; the TestFlight card on the app's page in the console lists every field of Apple's New App form). After that `POST /api/dev/apps/:id/testflight` does the rest; the repository needs no Apple secrets.
- Providing the Android keystore and its passwords; you may store them with `gh secret set` once handed over.
- Web apps: creating a free Cloudflare account and a token from the "Edit Cloudflare Workers" template, then the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (you may run `gh secret set` once handed the values). ourapps never holds them.
- Creating API keys (browser session only).
- Anything Apple's beta review asks.
- Sending share links to people.

## Concepts

- App: a listing plus a GitHub repository. Has an opaque `id` (used by the repository as `STORE_APP_ID`) and a build token (used by the repository as `STORE_BUILD_TOKEN`; returned once on creation).
- Release: the latest GitHub Release of the repository. The console reads the asset named `my-app.json` and follows the URLs inside it. Never cached.
- Share link: `/l/<linkId>`, random, revocable, optional expiry. Friends open this.

## Apps

```
GET  /api/dev/apps
-> { "apps": [ App & { "releaseIcon": "https://ourapps.app/dl/..." | "" } ] }

POST /api/dev/apps
body: { "name": "Poker Night", "repo": "owner/name", "bundleId": "com.yourname.pokernight",
        "tagline": "", "description": "", "whatsNew": "", "privacySummary": "",
        "size": "", "minOs": "", "ageNote": "", "iconUrl": "", "screenshots": [],
        "screenshotsByPlatform": { "iphone": [], "ipad": [], "android": [], "web": [] }, "manifestUrl": "", "showOnPage": false }
-> 201 { "app": App, "buildToken": "48 hex chars, shown once" }

GET  /api/dev/apps/:id
-> { "app": App, "links": [ShareLink] }

PUT  /api/dev/apps/:id        body: any subset of the POST fields -> { "app": App }
DELETE /api/dev/apps/:id      -> { "ok": true }   (also deletes its links; the app stays in App Store Connect)
POST /api/dev/apps/:id/build-token  -> { "buildToken": "new token, shown once" }  (old token stops working)
GET  /api/dev/apps/:id/testflight   -> TestFlight
POST /api/dev/apps/:id/testflight   -> TestFlight  (sets up and asks the repository for the first build; once set up, checks with Apple now; body {"repair": true} runs the set-up again)
POST /api/dev/apps/:id/testflight/build  -> TestFlight  (asks the repository for a release now; 409 before set-up)
PUT  /api/dev/review-contact        body: { "firstName", "lastName", "email", "phone" }  (who Apple's beta review contacts)
```

TestFlight: `{ "setUp", "needs", "storeApp", "stage", "url": "https://testflight.apple.com/join/..." | null, "invitation": { "state", "checkedAt" }, "buildRequest": { "at", "error" } | null, "profile", "contact", "builds": [ { "version", "buildNumber", "state", "appleState", "message", "uploadedAt", "submittedAt", "expiresAt", "updatedAt" } ] }`. A build's `state` is `uploading`, `uploaded`, `processing`, `in-review`, `approved`, `open`, `rejected`, `failed` or `expired`; `appleState` is Apple's ExternalBetaState. `invitation.state` is what testflight.apple.com shows for the public link: `open`, `not-accepting`, `full`, `missing`, or null before the first check. The install page and `/latest` offer the link only when it is `open`. ourapps answers Apple's export compliance question for every build ("no non-exempt encryption"). `stage` (after set-up) says what the invitation waits for: `no-build` (ask the repository for one), `waiting-for-upload`, `processing` (ourapps answers Apple's export compliance question here), `in-review` (Apple's beta review), `approved`, `link-closed` (Apple has the build but the invitation still refuses testers; the developer checks the public link in App Store Connect), `rejected`, `failed` or `open`. `needs` is the developer's next step, or null: `bundle-id`, `apple-key`, `signing` and `review-contact` are known without asking Apple; `store-app`, known only after a POST, means the app is not in App Store Connect yet. `storeApp` is `{ "name", "otherName", "bundleId", "sku" }`, what to type into Apple's New App form (`otherName` when the name is taken), until the app is set up. With `setUp` false and `needs` null, POST to check with Apple. Both methods answer 200; POST registers the bundle ID with Apple first, so it is in the New App form's list. The public link lets anyone join without a per-person invitation, but only once a build has passed Apple's beta review.

Field rules: `name` required; `repo` must be `owner/name`; `bundleId` is the Xcode bundle identifier (`com.yourname.app`), iPhone apps only; `iconUrl`, `manifestUrl` and every screenshot must be https URLs; at most 10 screenshots per list; `screenshotsByPlatform` keys are `iphone`, `ipad`, `android`, `web` (empty lists are dropped); `showOnPage` lists the app, details only, on the developer's public page.

App object: `{ id, developerId, name, tagline, description, whatsNew, size, minOs, ageNote, privacySummary, iconUrl, screenshots, screenshotsByPlatform, repo, manifestUrl, bundleId, ascAppId, testflightUrl, showOnPage, createdAt, updatedAt }`.

After creating an app, store the token and id in the repository at once, passing the values on standard input so they never appear on a command line:

```
printf '%s' "$BUILD_TOKEN" | gh secret set STORE_BUILD_TOKEN --repo owner/name
printf '%s' "$APP_ID" | gh secret set STORE_APP_ID --repo owner/name
```

Never print the build token or put it in a file or a chat: it lets its holder fetch the developer's iPhone signing key. If it cannot be stored (no `gh`, no access, the repository does not exist yet), say so and drop it; once the repository is ready, `POST /api/dev/apps/:id/build-token` makes a new one to store.

## Release status

```
GET /api/dev/apps/:id/release
-> { "ok": true, "githubToken": true, "appleKey": true,
     "web": { "hosting": "own", "url": "https://poker-night-web.you.workers.dev/", "ok": true, "status": 200 } | { "hosting": "ourapps", ... } | null,
     "tag": "v0.1.1", "publishedAt": "...", "assets": ["my-app.json", "icon.png", "poker-night.apk"],
     "manifestUrl": "https://api.github.com/repos/.../assets/123", "version": "0.1.1",
     "install": { "ios": false, "android": true, "pwa": false }, "screenshots": 3, "changelog": true, "errors": [] }
-> { "ok": false, ..., "errors": ["no release visible on owner/name: the repository does not exist, has no published release yet, or is private and needs a GitHub token in Settings"] }
```

Use this after every publish. Typical errors and what fixes them:

| error contains | fix |
|---|---|
| `no release visible` | GitHub answers the same for a missing repository, one without a published release, and a private one the store cannot see. Tell them apart with `gh repo view owner/name` and `gh release list --repo owner/name`; a private repository needs the developer to save a GitHub token at /dev/settings (you cannot) |
| `does not include this repository` | the developer adds the repository to their fine-grained GitHub token on GitHub |
| `no published release visible` | publish the release, or add the repository to the developer's GitHub token; publish it (create it as a draft, upload every asset with my-app.json last, then publish; never a pre-release) |
| `has no asset named my-app.json` | upload the file with exactly that name |
| `is invalid:` | the field named in the message; see schema below |

## Preview

```
GET /api/dev/apps/:id/preview
-> { "preview": true, "linkId": null, "developer": {...}, "app": {...},
     "release": { "version", "minPlayers", "maxPlayers", "install", "fallbackName", "fallbackIcon", "fallbackDescription", "fallbackScreenshots" } | null,
     "releaseError": null | "message", "screenshots": {...}, "history": [...] }
```

When `release` is null the install page shows the listing with "has no published build yet" and no install button; `releaseError` in the preview says why. `GET /api/public/links/:id` returns the same shape without `preview`, and its `releaseError` is only "no published build yet", never the reason.

The same data the install page renders, so you can confirm icon, screenshots and text are in place. Both this and the public link endpoint include `screenshots`: `{ "all": [...], "iphone"?: [...], "ipad"?: [...], "android"?: [...], "web"?: [...] }`, the general list and each version's own list, private release assets already on signed links. For each version (iPhone, iPad, Android, Web) the install page shows the first list that exists: that version's list in the dashboard, that version's list in my-app.json, the general list in the dashboard, the general list in my-app.json, then the closest other version's list (so a single set covers every version), and generated previews in the version's shape only when no screenshots exist at all. Both also include `history`: one entry per published release (`version`, `tag`, `title`, `notes`, `date`, `sha`, `releaseUrl`, `commitUrl`), built from the repository's releases and tags. Notes come from the `CHANGELOG.md` release asset (Keep a Changelog sections matched by version), then the release body, then the commit message. GitHub links are present only for public repositories.

## Release notes

Friends see the revision history on the install page, so every release needs notes written for them. The mechanism: keep `CHANGELOG.md` at the repository root in Keep a Changelog form (`## [1.2.0] - 2026-10-17` sections, newest first, an `[Unreleased]` section allowed); the release workflow uploads `CHANGELOG.md` as a release asset and uses the version's section as the release body, failing when the section is missing. Draft the entry from the commits in plain words (what changed for the people using the app, not file names), then ask the developer to approve the wording. `GET /api/dev/apps/:id/release` returns `changelog: false` when the latest release did not ship the file.

## Share links

```
POST /api/dev/apps/:id/links      body: { "label": "Mum and Dad", "expiresAt": "2027-01-01T00:00:00Z" | null }
-> 201 { "link": { "id", "appId", "developerId", "label", "createdAt", "expiresAt", "revokedAt" }, "url": "https://ourapps.app/l/<id>" }

PUT /api/dev/links/:id            body: { "label": "Thursday table" } -> { "link": {...} }   (label only; the address does not change)
POST /api/dev/links/:id/revoke    -> { "ok": true }
DELETE /api/dev/links/:id         -> { "ok": true }

GET /api/public/links/:id         (no auth) -> install page data (the preview shape, see above), 410 when expired or revoked, 404 when unknown
GET /api/public/links/:id/qr.svg  (no auth) -> SVG QR code of the link
GET /api/public/links/:id/latest  (no auth) -> { "name", "version", "testflightUrl": string | null, "testflightVersion": string | null, "android": { "apkUrl" } | null, "pwa", "linksExpireAt" }
                                  "pwa" is the URL to open: https://<linkId>.ourapps.app/ when the release ships web.zip, else the manifest's own URL, else null
```

Give the developer the `url`; one link per person or group is the convention so links can be revoked one at a time.

`/latest` returns 503 `{"error": "no release of this app is available right now"}` when no release can be read (none published, or the developer's GitHub token cannot see the repository); treat that as "no update". It is what an installed app polls to offer updates: compare `version` with the running version, then open `android.apkUrl`, or `testflightUrl` on iPhone (TestFlight also updates the app by itself). On iPhone compare with `testflightVersion`, the newest build Apple has approved, which can be older than `version` while a new one is in beta review. The signed links inside are good for one hour, so fetch right before opening. Recommend a dedicated link labelled "In-app updates" that is never revoked.

## Limits worth telling the developer

- Apple: TestFlight takes up to 10,000 people per app through the public link; each build lasts 90 days (ourapps sends `my-store-release` two weeks before expiry); Apple's beta review checks the first build of each version. Universal iPhone and iPad apps need no extra fields; build one .ipa with TARGETED_DEVICE_FAMILY 1,2.
- Android and web: no device limit.
- Android does not auto-update; friends tap Update. TestFlight updates iPhone apps. Version numbers must increase and the Android signing key must stay the same.

## Terms

A developer must accept the current terms (`/terms`) in a browser before `/api/dev/*` works for their session; API keys are not gated by the terms. `GET /api/dev/me` returns `termsVersion` and `developer.termsAcceptedVersion`. `DELETE /api/dev/me` (dashboard only, body `{"confirm": "<github login>"}`) removes the account and everything under it.

## Developer settings

```
PUT /api/dev/me        body: { "slug": "george", "displayName": "George" }   (manage scope)
PUT /api/dev/secrets   dashboard only; returns 403 for API keys
POST /api/dev/signing  dashboard only; the browser makes the key and certificate request
GET /api/dev/audit     -> { "events": [ { "event", "detail", "country", "createdAt" } ] }   (recent security events)
GET /api/dev/keys      -> { "keys": [ { "id", "developerId", "name", "prefix", "scope", "createdAt", "expiresAt", "lastUsedAt", "revokedAt" } ] }   (creating and revoking keys is dashboard only)
```

If a task needs the GitHub token or the Apple key saved or changed, or iPhone signing set up, tell the developer to do it at `/dev/settings`; there is no API path for it by design. `GET /api/dev/me` shows `secrets.signing` (certificate name and expiry) once signing is set up.

## Public and build endpoints (for completeness)

- `GET /api/public/dev/:slug` -> developer name and opted-in apps, details only.
- `GET /api/build/:appId/signing` (certificate, private key, App Store profile and TestFlight link; `HEAD` for the status alone) and `POST /api/build/:appId/testflight/upload` and `/commit` (upload through ourapps) are called by the repository workflow with `Authorization: Bearer <STORE_BUILD_TOKEN>`; see contract.md.
- `GET /api/health` -> `{ "ok": true, ... }`.

## my-app.json, schema 1

Published as a release asset named `my-app.json`:

```json
{
  "schema": 1,
  "id": "poker-night",
  "name": "Poker Night",
  "version": "0.1.1",
  "description": "Texas hold'em for the Thursday table, 3 to 9 players.",
  "icon": "https://api.github.com/repos/owner/name/releases/assets/1",
  "minPlayers": 3,
  "maxPlayers": 9,
  "screenshots": ["https://api.github.com/repos/owner/name/releases/assets/2"],
  "install": {
    "pwa": null,
    "android": { "apk": "https://api.github.com/repos/owner/name/releases/assets/3" },
    "ios": { "bundleId": "com.example.pokernight", "testflight": "https://testflight.apple.com/join/AbCd1234", "devices": ["iphone", "ipad"] }
  }
}
```

`install.pwa`: the https address of the web version, normally the developer's own Cloudflare deploy (`https://<app>-web.<subdomain>.workers.dev/`), opened as is; its build carries a manifest, the Apple home screen tags and a copy of https://ourapps.app/web/install-banner.js (contract.md "Web apps"). A release-asset URL whose asset is named exactly `web.zip` is a bundle the store serves at `https://<linkId>.ourapps.app/`. The install page, `/api/public/links/:id` and `/latest` report the served address, never the GitHub one; the dashboard preview reports null because the preview has no link address. For `web.zip` apps the store injects the same "add to home screen" banner (`/__ourapps/install.js`) into served HTML and, when missing, a standalone manifest, Apple home screen tags and an icon link. Either way the app installs to the home screen with one tap and keeps its camera and microphone grants. When writing a web app for this, request `getUserMedia` from a tap handler and reuse the stream.

Rules: `schema` must be 1; `id` lowercase slug; `name`, `version`, `description` non-empty; `icon` https; `minPlayers` and `maxPlayers` integers of at least 1 with min <= max; `screenshots` optional list of https URLs; optional `screenshotsByPlatform` object with keys `iphone`, `ipad`, `android`, `web`, each a list of https URLs (empty lists allowed, unknown keys rejected); `install` must name all three keys, at least one not null; `ios` needs `bundleId`, and `testflight` is an https URL or null; optional `ios.devices` lists `"iphone"` and/or `"ipad"` (display only: the page says which devices the build is for and warns on the other, never blocks). Release-asset API URLs are fetched with the developer's GitHub token and re-served to phones through signed links; any other https URL is used as is.

## Workflows

Register an app and hand back a share link:

1. `POST /api/dev/apps` with the listing. Store `buildToken` and `app.id` as repository secrets immediately.
2. Make the repository follow contract.md (release workflow, my-app.json, the `my-store-release` trigger). Push a tag.
3. `GET /api/dev/apps/:id/release` until `ok` is true; fix the listed errors.
4. `POST /api/dev/apps/:id/links` with a label. Report `url` and the QR URL.

Diagnose "the page shows no version":

1. `GET /api/dev/me`: if `secrets.github` is false, the developer must save a token.
2. `GET /api/dev/apps/:id/release`: read `errors`.
3. `GET /api/dev/apps/:id/preview`: confirm `release` is not null.

Put an iPhone app on TestFlight:

1. `GET /api/dev/apps/:id/testflight`; while `needs` names a step, tell the developer what it is. The console's TestFlight card walks them through each one, including Apple's New App form.
2. `POST /api/dev/apps/:id/testflight` checks with Apple and, once the app is in App Store Connect, sets up the App Store profile, the friends' beta group and its public link, and asks the repository for the first build.
3. The repository uploads each build through ourapps (contract.md step 4). Follow `stage` with GET (or POST to check with Apple now) and tell the developer plainly what it waits for: the repository's build, Apple's processing or beta review, or the public link in App Store Connect. The install page offers the invitation once `invitation.state` is `open`.

## Prompts

Two prompts the developer can paste into a coding agent are shown on `/dev/agents`, pre-filled for their app: one for an agent inside the app repository (sets up releases to the contract), one for an agent that drives this API (register, check, set up TestFlight, share).

Source code and issues: https://github.com/george-mcintyre/ourapps (public for reading, all rights reserved; outside pull requests are not accepted). Security problems: report privately at https://github.com/george-mcintyre/ourapps/security/advisories/new, never in a public issue.

Copyright Level N Ltd 2026.
