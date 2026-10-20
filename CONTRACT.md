# Contract for app repositories

What an app's GitHub repository must do so the store can install it on friends' phones.
The store never looks at your source; it reads one release asset and talks to one workflow.
Served at https://ourapps.app/contract.md; the API reference for agents is at
https://ourapps.app/agents.md. The store dashboard at /dev/agents carries a prompt that sets a
repository up to this contract.

## 1. Publish a release with `my-app.json`

Every build publishes a GitHub Release (not a pre-release, not a draft) with these assets:

| asset            | required for | content                                                     |
|------------------|--------------|-------------------------------------------------------------|
| `my-app.json`    | always       | schema 1 manifest (shape and rules in agents.md)             |
| `icon.png`, `screenshot-*.png` | recommended | referenced from my-app.json `icon`, `screenshots` and `screenshotsByPlatform` |
| `CHANGELOG.md`   | recommended  | Keep a Changelog file; the version's section is the release notes |
| `manifest.plist` | iOS          | Apple over-the-air manifest pointing at the `.ipa` asset    |
| `<app>.ipa`      | iOS          | Ad Hoc signed build                                         |
| `<app>.apk`      | Android      | signed APK                                                  |

The store resolves `GET /repos/<owner>/<repo>/releases/latest`, takes the asset named
`my-app.json`, and follows the URLs inside it. Those URLs are the release-asset API URLs,
for example `https://api.github.com/repos/<owner>/<repo>/releases/assets/<id>`, which the
store fetches with the developer's GitHub token. The same applies to the `.ipa` URL inside
`manifest.plist`: write it as the asset API URL. The store rewrites it to a short-lived
signed link before the phone sees it, so private repositories work and nothing public is
guessable.

Repositories that publish elsewhere can set a direct `my-app.json` URL on the app in the
dashboard instead; the artefact URLs then need to be HTTPS and unguessable.

### Release notes become the revision history

The install page shows a revision history built from the repository's releases: one entry per
published (non-draft, non-pre-release) release, labelled with the version found in the release
name or tag, dated from the release, and showing the commit the tag points at.

Notes for each version come, in order of preference, from:

1. The `CHANGELOG.md` asset on the latest release, in Keep a Changelog form: a
   `## [1.2.0] - 2026-10-17` (or `## 1.2.0`, `## v1.2.0`) section per version, newest first.
   `### Added`, `### Changed`, `### Fixed` subheadings become labels; bullets stay bullets.
   An `[Unreleased]` section is ignored. One file covers every version.
2. The release body.
3. The commit message of the tagged commit.

Keep `CHANGELOG.md` at the repository root, have the workflow upload it as a release asset
and use the version's section as the release body, and fail the release when the section is
missing. Write for the people who use the app. GitHub's generated "by @user in ..." and
"Full Changelog" lines are stripped; links to GitHub appear only when the repository is
public. A release named like "Skull 0.7.2 (build 53)" shows only the version; names that say
more ("First table night") show as a title. The "What's new" section shows the latest
release's notes and the "Updated" date is the release date; the dashboard's What's new field
and listing edit date are used only when no release notes exist.

### Screenshots per version

`screenshots` is the general list. The optional `screenshotsByPlatform` object gives a version
its own list, with keys `iphone`, `ipad`, `android` and `web` (each a list of https URLs; an
empty list counts as not provided; unknown keys fail validation). Screenshots keep their own
proportions on the page: portrait for phones, usually 3:4 for iPad, landscape for web.

```json
"screenshots": ["https://api.github.com/repos/you/app/releases/assets/11"],
"screenshotsByPlatform": {
  "ipad": ["https://api.github.com/repos/you/app/releases/assets/12"],
  "web": ["https://api.github.com/repos/you/app/releases/assets/13"]
}
```

For each version (iPhone, iPad, Android, Web) the install page shows the first list that exists: that version's list in the dashboard, that version's list in my-app.json, the general list in the dashboard, the general list in my-app.json, then the closest other version's list (so a single set covers every version), and generated previews in the version's shape only when no screenshots exist at all.
On a phone or tablet the page shows the matching version; on a computer it shows a tab per version.

## 2. Listen for rebuild requests

When a developer approves a new iPhone, the store registers the device with Apple,
recreates the Ad Hoc profile, and sends:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
{ "event_type": "my-store-rebuild", "client_payload": { ... } }
```

`client_payload` keys:

| key             | meaning                                                            |
|-----------------|--------------------------------------------------------------------|
| `app`           | opaque app id from the dashboard; echo it back, never hardcode it  |
| `enrolmentId`   | the device enrolment that triggered this build                     |
| `udid`          | the new device                                                     |
| `deviceName`    | the friend's name as typed on the install page                     |
| `profileName`   | Ad Hoc profile name                                                |
| `profileId`     | Apple's id of the new profile                                      |
| `profileUuid`   | UUID of the new profile                                            |
| `profileUrl`    | where to download the profile (step 3)                             |
| `buildReadyUrl` | where to report the published build (step 5)                       |

Workflow trigger:

```yaml
on:
  repository_dispatch:
    types: [my-store-rebuild]
```

## 3. Get the certificate, key and profile

The store holds the developer's Apple Distribution certificate, its private key and each app's
Ad Hoc profile; the repository needs no Apple secrets. One call returns all three:

```
GET https://ourapps.app/api/build/<STORE_APP_ID>/signing
Authorization: Bearer $STORE_BUILD_TOKEN
```

Response: `{ "certificate": { "id", "name", "serialNumber", "expirationDate", "base64" },
"privateKeyPem", "teamId", "profile": { "profileName", "profileId", "uuid", "profileBase64",
"expirationDate" } }`. `certificate.base64` is the DER certificate and `privateKeyPem` a PKCS #8
RSA key. The answer is 404 until the developer has set up iPhone signing and the app has a
profile; `HEAD` gives the same status without the key, so build for iPhone only when it is 200.
The profile is the latest one the store made, so tag builds and rebuilds use the same call.

On the macOS runner:

```bash
curl -sSf -H "Authorization: Bearer $STORE_BUILD_TOKEN" \
  "https://ourapps.app/api/build/$STORE_APP_ID/signing" > "$RUNNER_TEMP/signing.json"
KC="$RUNNER_TEMP/build.keychain-db"
security create-keychain -p "" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "" "$KC"
jq -r .privateKeyPem "$RUNNER_TEMP/signing.json" > "$RUNNER_TEMP/key.pem"
jq -r .certificate.base64 "$RUNNER_TEMP/signing.json" | base64 -d > "$RUNNER_TEMP/cert.cer"
security import "$RUNNER_TEMP/key.pem" -k "$KC" -A
security import "$RUNNER_TEMP/cert.cer" -k "$KC"
rm "$RUNNER_TEMP/key.pem"
security set-key-partition-list -S apple-tool:,apple: -s -k "" "$KC" >/dev/null
security list-keychain -d user -s "$KC" login.keychain-db
uuid=$(jq -r .profile.uuid "$RUNNER_TEMP/signing.json")
mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
jq -r .profile.profileBase64 "$RUNNER_TEMP/signing.json" | base64 -d \
  > ~/Library/MobileDevice/Provisioning\ Profiles/"$uuid".mobileprovision
```

Build with manual signing: identity `Apple Distribution` and the profile named
`.profile.profileName`, set on the app target only (in the project, for example XcodeGen's
`project.yml`). Passed as `xcodebuild` overrides they also reach Swift package resource bundles,
which then fail with "requires a development team". The team id is `.teamId`. Delete the keychain and `signing.json` when the job ends, also on failure.
`<profileUrl>` from the payload returns the profile alone:
`{ "profileName", "profileId", "uuid", "profileBase64", "expirationDate" }`.

## 4. Build and publish

Build the `.ipa` with the downloaded profile, write `manifest.plist`, create the release
with the assets from step 1. Asset `my-app.json` must carry the new version.

## 5. Report the build

```
POST <buildReadyUrl>
Authorization: Bearer $STORE_BUILD_TOKEN
Content-Type: application/json
{
  "app": "<client_payload.app>",
  "manifestUrl": "<asset API URL of manifest.plist>",
  "version": "0.1.1",
  "profileUuid": "<uuid of the profile the build used>"
}
```

The store marks ready every waiting device whose UDID is inside that profile. Devices
approved after the workflow fetched the profile are not in the build; the store sends one
more `my-store-rebuild` for them automatically. Response:
`{ "ready": [ids], "waiting": [ids], "redispatched": true|false }`.

## iPad

A universal app needs nothing extra: build one `.ipa` with `TARGETED_DEVICE_FAMILY` set to
`1,2`. Optionally say which devices the build targets with `install.ios.devices`, any of
`"iphone"` and `"ipad"` (for example `["iphone", "ipad"]`). It is display only: the install page
says "for iPhone and iPad" or "for iPhone", and warns on the device a build was not made for, but
never blocks an install. Absent, the page makes no claim. iPads enrol and install exactly like iPhones, appear in the same Ad Hoc profile, and use
Apple's separate allowance of 100 iPads per membership year. An iPhone-only build also installs
on iPads (in a phone-sized window) and uses an iPad slot there.

## Secrets the app repository needs

| secret               | from                                                    |
|----------------------|---------------------------------------------------------|
| `STORE_BUILD_TOKEN`  | shown once when the app is created in the dashboard     |
| `STORE_APP_ID`       | the app's id in the dashboard                           |
| Android keystore     | your own                                                |

`STORE_BUILD_TOKEN` is per app. Rotate it from the app's page in the dashboard.

## Optional: web apps

`install.pwa` is the https address the install page opens. Put the built site on your own free
Cloudflare account: Cloudflare serves plain files without a request limit or charge, your
workflow deploys them, and ourapps never sees your Cloudflare token.

### On your own Cloudflare account

Once per Cloudflare account, in the dashboard:

1. Create a free account at https://dash.cloudflare.com, or use an existing one.
2. Workers & Pages: choose a `workers.dev` subdomain. Sites are served at
   `https://<worker name>.<subdomain>.workers.dev`.
3. My Profile, API Tokens, Create Token, template "Edit Cloudflare Workers". Account
   Resources: your account; Zone Resources: all zones from that account. Copy the token; it is
   shown once.
4. Copy the Account ID (Workers & Pages, Account details).

Once per repository: Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

`wrangler.jsonc` in the repository describes a Worker with files only, under a name no other
Worker on the account uses:

```jsonc
{
  "name": "<app>-web",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./web/dist", "not_found_handling": "single-page-application" },
  "workers_dev": true,
  "preview_urls": false
}
```

The release workflow builds the site, deploys it and keeps the address for `install.pwa`:

```yaml
- name: Deploy the web app
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  run: |
    npx wrangler@4 deploy | tee "$RUNNER_TEMP/deploy.log"
    echo "WEB_URL=$(grep -oE 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev' "$RUNNER_TEMP/deploy.log" | head -1)/" >> "$GITHUB_ENV"
```

Each deploy replaces the site in place, so the address stays the same from release to release.
Fail the release when the deploy fails or `WEB_URL` is empty.

In the build output:

- `manifest.webmanifest` (name, `start_url` and `scope` of `./`, `display: "standalone"`, 192
  and 512 pixel icons) and the `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` and
  `apple-touch-icon` tags, so the app runs from the home screen.
- A copy of https://ourapps.app/web/install-banner.js, fetched at build time and loaded with
  `<script src="install-banner.js" defer></script>`: the "add to home screen" banner the install
  page tells friends to expect. Copy it; do not link to ourapps.
- `_headers` at the root: `X-Robots-Tag: noindex` for `/*`, and for threaded Unity or Godot
  builds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- No pre-compressed files. Cloudflare compresses `.html`, `.js`, `.css` and `.wasm` itself and
  does not honour `Content-Encoding` from `_headers`, so a `.br` or `.gz` file reaches the browser
  still compressed. Unity: Compression Format "Disabled", or Brotli with "Decompression Fallback".

Free plan limits: 20,000 files per deploy, 25 MiB per file, 100 Workers per account.

The address is public: anyone who has it can open the app, and revoking a share link does not
stop them. Keep private data behind the app's own sign-in, and allow the address in your API's
CORS. Storage, service workers and permissions belong to that address.

An app that already runs its own Cloudflare Worker can serve the build from it instead, with an
`assets` block in that Worker's settings, which puts the web app and its server on one address.

### Served by the store from `web.zip`

Apps that publish it keep working: a release-asset URL whose asset is named exactly `web.zip` is
a bundle of the built site that the store copies and serves at `https://<linkId>.ourapps.app/`,
one origin per share link, nothing from the console shared with it. On the first request after a
release the store fetches the zip, unpacks it once into its storage and serves single files from
there; the release is re-checked at most once a minute. These requests count against ourapps'
shared allowance, which is why new web apps go on the developer's own account. When a release
drops `web.zip` and `install.pwa` names an address elsewhere, the link addresses redirect there,
so home screen icons made from them keep opening the app.

- Limits: zip at most 25 MB, at most 32 MB unpacked, any file at most 24 MB, at most 2,000
  files, at most 8 MB of compressed (deflated) content. Build it uncompressed:
  `zip -0 -r web.zip .` (text is brotli-compressed on the way to the browser anyway).
- Layout: `index.html` at the zip root or inside one top-level folder. Relative (`./`) or
  root (`/`) paths both work because the app is served at the root of its own origin.
  `manifest.webmanifest` with `start_url` and `scope` of `./`; service worker registered
  with a relative path. Unknown paths without an extension get `index.html`.
- Pre-compressed files (`.wasm.br`, `.js.gz`, `.data.br` and similar) are sent with
  `Content-Encoding` and the inner content type, as Unity and Godot expect.
- An optional `_headers` file (Cloudflare Pages format) may set
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`,
  `Cross-Origin-Resource-Policy`, `Permissions-Policy`, `Content-Security-Policy` and
  `Cache-Control`; anything else is ignored. Needed for threaded Unity and Godot builds.
- Storage, service workers and permissions belong to each link's origin. Allow the link
  origins (`^https://[0-9a-f]{16,64}\.ourapps\.app$`) in your API's CORS and use token
  authentication, not cookies.

## Optional: in-app updates

Installed apps do not update by themselves. An app can poll
`GET https://ourapps.app/api/public/links/<linkId>/latest` (any active share link; a dedicated
"In-app updates" link is the convention), compare `version` with its own, and open
`ios.installUrl` or `android.apkUrl`. The links inside expire after one hour. Bump
`versionCode` / `CFBundleVersion` on every release and keep the Android signing key stable.

## Limits to design around

- Apple allows 100 iPhones per membership year across all of the developer's apps; slots free only at renewal.
- Ad Hoc builds stop launching when the profile expires (one year); re-sign and publish a
  new release before then. The store shows the profile expiry on the app page. The Apple
  Distribution certificate also lasts a year; replace it under Settings, then publish.
- macOS GitHub Actions minutes cost ten times Linux minutes against the free allowance;
  keep the iOS job lean or document a local Xcode signing path.

Copyright Level N Ltd 2026.
