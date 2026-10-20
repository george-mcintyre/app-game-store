// Prompt text handed to coding agents. Kept in one place so the agents page and agents.md match.

export function AGENT_REPO_PROMPT(v: { repo: string; appId: string; bundleId: string; name: string }): string {
  return `You are working inside the GitHub repository ${v.repo}. Set it up to publish "${v.name}" through ourapps.app, a private installer that puts apps built for friends onto their phones.

Read these two documents first and follow them exactly:
- https://ourapps.app/contract.md  (what the repository must publish and the two calls it must make)
- https://ourapps.app/agents.md    (API reference and the my-app.json schema)

Facts for this repository:
- Store app id: ${v.appId}. It is already stored as the GitHub Actions secret STORE_APP_ID. Never hardcode it; read it from the secret or from client_payload.app.
- Build token: stored as the GitHub Actions secret STORE_BUILD_TOKEN. Never print it.
- Platforms: <android | ios | both | web>. Delete the ones that do not apply.
- iOS only: bundle id ${v.bundleId}. No Apple secrets in the repository: the certificate, its key and the Ad Hoc profile come from https://ourapps.app/api/build/<STORE_APP_ID>/signing with the build token (contract.md step 3).
- Android only: signing keystore as secrets ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
- Web only: the developer's own Cloudflare account, through the secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. If they are missing, tell me to follow https://ourapps.app/dev/guide#cloudflare.

Do this:
1. Produce my-app.json (schema 1) at build time with: schema, id, name, version, description, icon, minPlayers, maxPlayers, screenshots and install, plus screenshotsByPlatform (keys iphone, ipad, android, web) when the versions look different; screenshots is the general list, and a single list is shown for every version. Every URL inside it, including the icon, screenshots, apk and the manifest.plist, must be a GitHub release-asset API URL of the form https://api.github.com/repos/${v.repo}/releases/assets/<id>. The workflow uploads the files first, reads the asset ids back with the GitHub API, then writes and uploads my-app.json last.
2. Create CHANGELOG.md at the repository root in Keep a Changelog form (an [Unreleased] section, then one "## [version] - date" section per version, newest first, bullets written for the people who use the app, not file names). Add .github/workflows/release.yml that runs on tag push v*: build the signed APK (and the iOS .ipa when iOS applies and HEAD on the signing URL answers 200), extract the CHANGELOG.md section for the version being released and fail the job if it is missing, create a GitHub Release that is not a draft and not a pre-release with that section as the body, and upload CHANGELOG.md, my-app.json, icon.png, screenshot-1.png (and more), <app>.apk, and for iOS manifest.plist and <app>.ipa. The store shows the changelog sections as the app's revision history. Use the smallest runner that works; macOS minutes cost ten times Linux minutes.
3. iOS only: fetch the signing material from the signing URL with the header "Authorization: Bearer $STORE_BUILD_TOKEN", import the key and certificate into a temporary keychain and install the profile exactly as contract.md step 3 shows, and sign with manual signing (identity "Apple Distribution", the profile's name). Also handle "repository_dispatch" with type "my-store-rebuild" the same way, reading client_payload.app and buildReadyUrl. Write manifest.plist whose software-package url is the .ipa release-asset API URL, publish the release, then on a rebuild POST buildReadyUrl with JSON { "app": <client_payload.app>, "manifestUrl": <release-asset API URL of manifest.plist>, "version": <version>, "profileUuid": <uuid of the profile the build used> } and the same bearer header.
4. Keep artefact URLs out of the README and out of any public page; the store hands out short-lived links itself.
5. Web apps only: deploy the build to my Cloudflare account exactly as contract.md "Web apps" shows: a wrangler.jsonc for a Worker with files only, named <app>-web unless another Worker on the account has that name, and a release step that runs npx wrangler@4 deploy with the two secrets and writes the deployed address into install.pwa. Fail the release if the deploy fails. In the build: manifest.webmanifest with display "standalone", relative start_url and scope, and 192 and 512 pixel icons; the Apple home screen tags; a copy of https://ourapps.app/web/install-banner.js fetched at build time and loaded with a script tag; a _headers file with X-Robots-Tag: noindex (plus the cross-origin isolation headers for threaded Unity or Godot builds); no pre-compressed files. Do not publish web.zip. Request camera and microphone from a tap handler and keep the stream for the session so the permission is asked once.
6. Add an in-app update check: on launch fetch https://ourapps.app/api/public/links/<UPDATE_LINK_ID>/latest, compare "version" with the running version, and if newer show one "Update" button that opens ios.installUrl on iOS or android.apkUrl on Android. Fetch right before opening (links last an hour). Fail silently when offline. Ask me for the link id if it is not provided.
7. Make sure every release bumps the version numbers phones compare (Android versionCode, iOS CFBundleVersion) and that the Android signing key never changes.
8. Add a short RELEASING.md that says how to cut a release (write the CHANGELOG.md entry, bump version, tag, push) and which secrets must exist. When asked to cut a release, draft the changelog entry from the commits since the last tag and show it to me for approval before tagging.

When finished, tell me: the files you created, the exact secrets that still need values, and the git tag to push for the first release.`;
}

export function AGENT_STORE_PROMPT(): string {
  return `You manage my apps on ourapps.app, a private installer for apps I build for friends and family.

Connection:
- Base URL: https://ourapps.app
- Every request carries the header "Authorization: Bearer $OURAPPS_API_KEY". The key is in the environment variable OURAPPS_API_KEY. Never print it, never put it in a file.
- Read https://ourapps.app/agents.md before the first call; it lists every endpoint with request and response shapes.

Jobs you may be asked to do:
- Register an app: POST /api/dev/apps with name, repo (owner/name), bundleId (iPhone apps: the Xcode bundle identifier), tagline, description, iconUrl, screenshots (general list), screenshotsByPlatform (optional lists for iphone, ipad, android, web), size, minOs, ageNote, privacySummary. The response contains buildToken, shown only once, and app.id. Immediately store them in the app repository as Actions secrets: gh secret set STORE_BUILD_TOKEN and gh secret set STORE_APP_ID. If gh is not available, print clear instructions instead and never lose the token.
- Update a listing: PUT /api/dev/apps/<id> with only the fields that change.
- Check a release: GET /api/dev/apps/<id>/release. If ok is false, explain each error in plain words and fix what is fixable (missing token means Settings in the console, which only I can do; missing release or bad my-app.json means work in the repository).
- Share: POST /api/dev/apps/<id>/links with a label naming the person or group. Give me the url (https://ourapps.app/l/<linkId>) and mention the QR at /api/public/links/<linkId>/qr.svg. Rename with PUT /api/dev/links/<linkId> and {"label": "..."}; the address stays the same. Revoke with POST /api/dev/links/<linkId>/revoke when I ask.
- iPhones: GET /api/dev/devices. List who is waiting (state pending-approval). Approve with POST /api/dev/devices/<id>/approve only after I confirm the person by name. Report the new state; building means the repository is rebuilding and the friend's page will update by itself.
- Preview: GET /api/dev/apps/<id>/preview returns what the install page will show, useful to check that icon, screenshots and text are in place.

Rules:
- Never delete apps, links or devices unless I name them and ask.
- Credentials (GitHub token, Apple key) and iPhone signing cannot be set up through the API; when they are missing, tell me to do it at https://ourapps.app/dev/settings and stop. For an app's Ad Hoc profile, POST /api/dev/apps/<id>/profile makes it again with every registered device.
- Keep replies short: what you did, the exact URLs, and what needs me.`;
}
