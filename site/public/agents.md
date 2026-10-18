# ourapps.app for agents

ourapps.app is a private installer: developers register apps they built for friends and family, create share links, and friends install from those links. This document is the complete reference for driving it programmatically. Everything the web console does is available through this API.

Base URL: `https://ourapps.app`. All request and response bodies are JSON. Errors are `{"error": "message"}` with a 4xx or 5xx status.

Related: the repository contract at `https://ourapps.app/contract.md` describes what an app's GitHub repository must publish and the two calls its workflow makes.

## Authentication

Send `Authorization: Bearer <api key>` on every `/api/dev/*` request. Keys start with `oa_` and are created by the developer in the console at `/dev/agents`. A key acts as that developer within its scope; everything is scoped to their apps, links and devices.

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

`secrets.github` false means the developer has not saved a GitHub token; the console cannot read private release assets or send rebuilds until they do (only they can do that, at `/dev/settings`). `secrets.apple` false means iPhone approvals will fail.

## Supported app types (summary)

Full detail: https://ourapps.app/reference.

- Native iPhone and iPad (.ipa, Ad Hoc; 100 devices per product family per membership year), native Android (signed universal .apk; no .aab), and anything that compiles to those (Flutter, React Native, .NET MAUI, Capacitor, Kotlin Multiplatform, Unity and Godot mobile).
- Static web apps and web games as a `web.zip` bundle served by ourapps on `https://<linkId>.ourapps.app/` (25 MB zip, 32 MB unpacked, built with `zip -0`; pre-compressed `.br`/`.gz` files and an allowlisted `_headers` file supported).
- Web apps needing a server: host them yourself and put their URL in `install.pwa`; ourapps links to them, never proxies.
- Backends, APIs and databases are never hosted by ourapps; apps call them directly. Web bundles must allow the link origins in CORS and authenticate with tokens, not cookies.

## What the developer must do themselves

Tell the developer plainly when a task is theirs; do not try to work around it:

- Signing in with GitHub, and creating the GitHub fine-grained token and the Apple App Store Connect API key (saved at `/dev/settings`; there is no API for credentials).
- The Apple portal setup per iPhone app: App ID, Apple Distribution certificate (.p12 and password), their own iPhone registered, an Ad Hoc provisioning profile with a chosen name.
- Providing signing material values (the .p12, keystore and passwords); you may store them with `gh secret set` once handed over.
- Creating API keys (browser session only).
- Deciding which iPhones to approve: list the waiting devices and approve only the people they name.
- Sending share links to people.

## Concepts

- App: a listing plus a GitHub repository. Has an opaque `id` (used by the repository as `STORE_APP_ID`) and a build token (used by the repository as `STORE_BUILD_TOKEN`; returned once on creation).
- Release: the latest GitHub Release of the repository. The console reads the asset named `my-app.json` and follows the URLs inside it. Never cached.
- Share link: `/l/<linkId>`, random, revocable, optional expiry. Friends open this.
- Enrolment (device): an iPhone that registered through a share link. States: `awaiting-device`, `pending-approval`, `registering`, `building`, `ready`, `rejected`, `failed`.

## Apps

```
GET  /api/dev/apps
-> { "apps": [ App & { "releaseIcon": "https://ourapps.app/dl/..." | "" } ] }

POST /api/dev/apps
body: { "name": "Skull", "repo": "owner/name", "profileName": "Skull Ad Hoc",
        "tagline": "", "description": "", "whatsNew": "", "privacySummary": "",
        "size": "", "minOs": "", "ageNote": "", "iconUrl": "", "screenshots": [], "manifestUrl": "", "showOnPage": false }
-> 201 { "app": App, "buildToken": "48 hex chars, shown once" }

GET  /api/dev/apps/:id
-> { "app": App, "links": [ShareLink], "profile": { "uuid", "expirationDate", "devices" } | null }

PUT  /api/dev/apps/:id        body: any subset of the POST fields -> { "app": App }
DELETE /api/dev/apps/:id      -> { "ok": true }   (also deletes its links, devices and profiles)
POST /api/dev/apps/:id/build-token  -> { "buildToken": "new token, shown once" }  (old token stops working)
```

Field rules: `name` required; `repo` must be `owner/name`; `iconUrl`, `manifestUrl` and every screenshot must be https URLs; at most 10 screenshots; `showOnPage` lists the app, details only, on the developer's public page.

App object: `{ id, developerId, name, tagline, description, whatsNew, size, minOs, ageNote, privacySummary, iconUrl, screenshots, repo, manifestUrl, profileName, showOnPage, createdAt, updatedAt }`.

After creating an app, store the token and id in the repository at once:

```
gh secret set STORE_BUILD_TOKEN --body "<buildToken>" --repo owner/name
gh secret set STORE_APP_ID --body "<app.id>" --repo owner/name
```

## Release status

```
GET /api/dev/apps/:id/release
-> { "ok": true, "githubToken": true, "appleKey": true,
     "tag": "v0.1.1", "publishedAt": "...", "assets": ["my-app.json", "icon.png", "skull.apk"],
     "manifestUrl": "https://api.github.com/repos/.../assets/123", "version": "0.1.1",
     "install": { "ios": false, "android": true, "pwa": false }, "screenshots": 3,
     "profile": { "uuid", "expirationDate", "devices" } | null, "errors": [] }
-> { "ok": false, ..., "errors": ["no release visible on owner/name; a private repository needs a GitHub token in Settings"] }
```

Use this after every publish. Typical errors and what fixes them:

| error contains | fix |
|---|---|
| `needs a GitHub token` | the developer saves a token at /dev/settings (you cannot) |
| `no published release found` | publish a non-draft, non-pre-release release |
| `has no asset named my-app.json` | upload the file with exactly that name |
| `is invalid:` | the field named in the message; see schema below |

## Preview

```
GET /api/dev/apps/:id/preview
-> { "preview": true, "linkId": null, "developer": {...}, "app": {...},
     "release": { "version", "minPlayers", "maxPlayers", "install", "fallbackName", "fallbackIcon", "fallbackDescription", "fallbackScreenshots" } | null,
     "releaseError": null | "message" }
```

The same data the install page renders, so you can confirm icon, screenshots and text are in place. Both this and the public link endpoint include `history`: one entry per published release (`version`, `tag`, `title`, `notes`, `date`, `sha`, `releaseUrl`, `commitUrl`), built from the repository's releases and tags. Notes come from the `CHANGELOG.md` release asset (Keep a Changelog sections matched by version), then the release body, then the commit message. GitHub links are present only for public repositories.

## Release notes

Friends see the revision history on the install page, so every release needs notes written for them. The mechanism: keep `CHANGELOG.md` at the repository root in Keep a Changelog form (`## [1.2.0] - 2026-10-17` sections, newest first, an `[Unreleased]` section allowed); the release workflow uploads `CHANGELOG.md` as a release asset and uses the version's section as the release body, failing when the section is missing. Draft the entry from the commits in plain words (what changed for the people using the app, not file names), then ask the developer to approve the wording. `GET /api/dev/apps/:id/release` returns `changelog: false` when the latest release did not ship the file.

## Share links

```
POST /api/dev/apps/:id/links      body: { "label": "Mum and Dad", "expiresAt": "2027-01-01T00:00:00Z" | null }
-> 201 { "link": { "id", "appId", "developerId", "label", "createdAt", "expiresAt", "revokedAt" }, "url": "https://ourapps.app/l/<id>" }

PUT /api/dev/links/:id            body: { "label": "Thursday table" } -> { "link": {...} }   (label only; the address does not change)
POST /api/dev/links/:id/revoke    -> { "ok": true }
DELETE /api/dev/links/:id         -> { "ok": true }

GET /api/public/links/:id         (no auth) -> install page data, 410 when expired or revoked, 404 when unknown
GET /api/public/links/:id/qr.svg  (no auth) -> SVG QR code of the link
GET /api/public/links/:id/latest  (no auth) -> { "name", "version", "ios": { "installUrl", "manifestUrl", "bundleId" } | null, "android": { "apkUrl" } | null, "pwa", "linksExpireAt" }
                                  "pwa" is the URL to open: https://<linkId>.ourapps.app/ when the release ships web.zip, else the manifest's own URL, else null
```

Give the developer the `url`; one link per person or group is the convention so links can be revoked one at a time.

`/latest` returns 503 `{"error": "no release of this app is available right now"}` when no release can be read (none published, or the developer's GitHub token cannot see the repository); treat that as "no update". It is what an installed app polls to offer updates: compare `version` with the running version, then open `ios.installUrl` (iOS shows its own Install prompt) or `android.apkUrl`. The signed links inside are good for one hour, so fetch right before opening. Recommend a dedicated link labelled "In-app updates" that is never revoked.

## Limits worth telling the developer

- Apple: 100 iPhones and, separately, 100 iPads per membership year across all of the developer's apps, counted per device; removing a device does not free its slot; Ad Hoc builds expire one year after their profile was made. Universal iPhone and iPad apps need no extra fields; build one .ipa with TARGETED_DEVICE_FAMILY 1,2.
- Android and web: no device limit.
- Nothing auto-updates; friends tap Update. Version numbers must increase and the Android signing key must stay the same.

## Devices (iPhones)

```
GET /api/dev/devices
-> { "enrolments": [ { "id", "appId", "linkId", "name", "state", "udid", "product", "profileUuid", "manifestUrl", "message", "createdAt", "updatedAt" } ] }

POST /api/dev/devices/:id/approve  -> { "enrolment": {...state: "building"}, "profileUuid": "..." }
POST /api/dev/devices/:id/reject   -> { "enrolment": {...state: "rejected"} }
DELETE /api/dev/devices/:id        -> { "ok": true }
```

Approve only `pending-approval` or `failed` devices and only when the developer has confirmed the person. Approve registers the device with Apple, recreates the Ad Hoc profile with every enabled device, and sends `repository_dispatch` (`my-store-rebuild`) to the app repository. A 409 means the device has no UDID yet or Apple credentials or the profile name are missing; a 502 carries Apple's or GitHub's message and leaves the device in `failed`.

Apple allows 100 iPhones per developer per membership year and does not free a slot when a device is removed.

## Terms

A developer must accept the current terms (`/terms`) in a browser before `/api/dev/*` works for their session; API keys are unaffected because they can only be created after acceptance. `GET /api/dev/me` returns `termsVersion` and `developer.termsAcceptedVersion`. `DELETE /api/dev/me` (dashboard only, body `{"confirm": "<github login>"}`) removes the account and everything under it.

## Developer settings

```
PUT /api/dev/me        body: { "slug": "george", "displayName": "George" }   (manage scope)
PUT /api/dev/secrets   dashboard only; returns 403 for API keys
GET /api/dev/audit     -> { "events": [ { "event", "detail", "country", "createdAt" } ] }   (recent security events)
```

If a task needs the GitHub token or the Apple key saved or changed, tell the developer to do it at `/dev/settings`; there is no API path for it by design.

## Public and build endpoints (for completeness)

- `GET /api/public/dev/:slug` -> developer name and opted-in apps, details only.
- `POST /api/enrol/new`, `GET /api/enrol/:id/profile.mobileconfig`, `POST /api/enrol/:id`, `GET /api/enrol/:id/status?since=<state>` drive the iPhone enrolment from the install page.
- `GET /api/build/:appId/profile` and `POST /api/build-ready` are called by the repository workflow with `Authorization: Bearer <STORE_BUILD_TOKEN>`; see contract.md.
- `GET /api/health` -> `{ "ok": true, ... }`.

## my-app.json, schema 1

Published as a release asset named `my-app.json`:

```json
{
  "schema": 1,
  "id": "skull",
  "name": "Skull",
  "version": "0.1.1",
  "description": "Skull-style bluffing card game for 3 to 6 friends.",
  "icon": "https://api.github.com/repos/owner/name/releases/assets/1",
  "minPlayers": 3,
  "maxPlayers": 6,
  "screenshots": ["https://api.github.com/repos/owner/name/releases/assets/2"],
  "install": {
    "pwa": null,
    "android": { "apk": "https://api.github.com/repos/owner/name/releases/assets/3" },
    "ios": { "bundleId": "com.example.skull", "adhoc": "https://api.github.com/repos/owner/name/releases/assets/4", "testflight": null, "devices": ["iphone", "ipad"] }
  }
}
```

`install.pwa`: a release-asset URL whose asset is named exactly `web.zip` is a bundle of the built site that the store serves at `https://<linkId>.ourapps.app/` (see contract.md for the build rules: relative base, index.html at the zip root, relative manifest and service worker paths); any other https URL is opened as is. The install page, `/api/public/links/:id` and `/latest` report the served address, never the GitHub one; the dashboard preview reports null because no link exists yet. Served HTML gets an injected "add to home screen" banner (`/__ourapps/install.js`) and, when missing, a standalone manifest, Apple home screen tags and an icon link, so the app installs to the home screen with one tap and keeps its camera and microphone grants. When writing a web app for this, request `getUserMedia` from a tap handler and reuse the stream.

Rules: `schema` must be 1; `id` lowercase slug; `name`, `version`, `description` non-empty; `icon` https; `minPlayers` and `maxPlayers` integers of at least 1 with min <= max; `screenshots` optional list of https URLs; `install` must name all three keys, at least one not null; `ios` needs `adhoc` or `testflight`; optional `ios.devices` lists `"iphone"` and/or `"ipad"` (display only: the page says which devices the build is for and warns on the other, never blocks). Release-asset API URLs are fetched with the developer's GitHub token and re-served to phones through signed links; any other https URL is used as is.

## Workflows

Register an app and hand back a share link:

1. `POST /api/dev/apps` with the listing. Store `buildToken` and `app.id` as repository secrets immediately.
2. Make the repository follow contract.md (release workflow, my-app.json, rebuild hook). Push a tag.
3. `GET /api/dev/apps/:id/release` until `ok` is true; fix the listed errors.
4. `POST /api/dev/apps/:id/links` with a label. Report `url` and the QR URL.

Diagnose "the page shows no version":

1. `GET /api/dev/me`: if `secrets.github` is false, the developer must save a token.
2. `GET /api/dev/apps/:id/release`: read `errors`.
3. `GET /api/dev/apps/:id/preview`: confirm `release` is not null.

Get an iPhone installed:

1. The friend opens the share link, taps Get, registers. `GET /api/dev/devices` shows `pending-approval`.
2. The developer confirms the person; `POST /api/dev/devices/:id/approve`.
3. The repository builds and calls `/api/build-ready`; the device becomes `ready` and the friend's page shows Install.

## Prompts

Two prompts the developer can paste into a coding agent are shown on `/dev/agents`, pre-filled for their app: one for an agent inside the app repository (sets up releases to the contract), one for an agent that drives this API (register, check, share, approve).

Source code and issues: https://github.com/george-mcintyre/ourapps (public for reading, all rights reserved; outside pull requests are not accepted). Security problems: report privately at https://github.com/george-mcintyre/ourapps/security/advisories/new, never in a public issue.

Copyright Level N Ltd 2026.
