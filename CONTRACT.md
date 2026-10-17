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
| `icon.png`, `screenshot-*.png` | recommended | referenced from my-app.json `icon` and `screenshots` |
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
| `profileUuid`   | UUID of the new profile; echo it in build-ready                    |
| `profileUrl`    | where to download the profile (step 3)                             |
| `buildReadyUrl` | where to report the published build (step 5)                       |

Workflow trigger:

```yaml
on:
  repository_dispatch:
    types: [my-store-rebuild]
```

## 3. Download the profile

```
GET <profileUrl>
Authorization: Bearer $STORE_BUILD_TOKEN
```

Response: `{ "profileName", "profileId", "uuid", "profileBase64", "expirationDate" }`.
Decode `profileBase64` to `~/Library/MobileDevice/Provisioning Profiles/<uuid>.mobileprovision`
and build with manual signing against that profile and your distribution certificate.
No App Store Connect key is needed in the app repository.

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
  "profileUuid": "<client_payload.profileUuid>"
}
```

The store marks ready every waiting device whose UDID is inside that profile. Devices
approved after the workflow fetched the profile are not in the build; the store sends one
more `my-store-rebuild` for them automatically. Response:
`{ "ready": [ids], "waiting": [ids], "redispatched": true|false }`.

## Secrets the app repository needs

| secret               | from                                                    |
|----------------------|---------------------------------------------------------|
| `STORE_BUILD_TOKEN`  | shown once when the app is created in the dashboard     |
| signing certificate  | your Apple distribution certificate and its password    |
| Android keystore     | your own                                                |

`STORE_BUILD_TOKEN` is per app. Rotate it from the app's page in the dashboard.

## Optional: in-app updates

Installed apps do not update by themselves. An app can poll
`GET https://ourapps.app/api/public/links/<linkId>/latest` (any active share link; a dedicated
"In-app updates" link is the convention), compare `version` with its own, and open
`ios.installUrl` or `android.apkUrl`. The links inside expire after one hour. Bump
`versionCode` / `CFBundleVersion` on every release and keep the Android signing key stable.

## Limits to design around

- Apple allows 100 iPhones per membership year across all of the developer's apps; slots free only at renewal.
- Ad Hoc builds stop launching when the profile expires (one year); re-sign and publish a
  new release before then. The store shows the profile expiry on the app page.
- macOS GitHub Actions minutes cost ten times Linux minutes against the free allowance;
  keep the iOS job lean or document a local Xcode signing path.

Copyright Level N Ltd 2026.
