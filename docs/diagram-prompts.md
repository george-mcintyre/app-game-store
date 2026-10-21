# Diagram prompts for the technical reference

Each prompt is self-contained: paste one whole block into the image generator. Ask for 16:9,
at least 2000 by 1125 pixels, PNG. Save the result under `site/public/reference/` with the file
name shown, and make the WebP copy with `cwebp -q 92 -m 6 <name>.png -o <name>.webp` in the same
folder. The reference page at `/reference` (and the guide, for `architecture.png`) shows each image
automatically; a missing image leaves its card without a picture, and a missing
`architecture.png` falls back to the drawing in `site/src/pages/reference.ts`.

Image generators often misspell text. Keep the labels as given, check every word in the result,
and regenerate or touch up in an editor when a label is wrong.

## Status

| file | state on 2026-10-21 |
|---|---|
| `architecture.png` | to regenerate: shows "iPhone enrolment" and Ad Hoc; iPhone now goes through TestFlight (prompt 1 updated) |
| `cross-platform.png` | to regenerate: the macOS lane says Ad Hoc and the release lists .ipa and manifest.plist (prompt 7 updated) |
| `testflight-sequence.png` | new: replaces `iphone-sequence.png`, which shows the Ad Hoc registration flow (prompt 8) |
| the others | current |

The PNGs are the masters; the site serves WebP copies. Delete `iphone-sequence.png` and `.webp`
once `testflight-sequence.png` is in place.

## Shared style (already included in every prompt below)

Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional,
no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA.
Content sits in white rounded rectangles (corner radius about 16 pixels) with 1 pixel light grey
borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top holds a small
logo of four rounded squares in indigo #8B85FF at falling opacity and the title in white.
Typography is a modern geometric sans serif like Inter or SF Pro: bold dark slate #0F172A
titles, smaller slate grey #475569 subtitles, sentence case, every word spelled exactly as given.
Simple 2 pixel line icons in slate or indigo. Dashed indigo #4F46E5 arrows mean installing and
updating; solid green #15803D arrows mean using the app; each arrow carries a short label. The
service ourapps is a pale indigo #EEF2FF container with a 1.5 pixel indigo #4F46E5 border.
Everything the developer owns and runs (their backend, their Cloudflare account) is pale green
#DCFCE7 with a green #15803D border. Small legend at the bottom left. Generous whitespace,
aligned grid, crisp edges.

---

## 1. `architecture.png`: typical app with its own API and database, three flavours

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "How a typical app is hosted and installed". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Four columns. Column 1 heading "Friends' devices" with three stacked cards, each with a line icon: "iPhone or iPad" / "native app (.ipa)"; "Android phone" / "native app (.apk)"; "Any browser" / "web app on the home screen".

Column 2: a tall pale indigo #EEF2FF container with a 1.5 px indigo #4F46E5 border, titled "ourapps.app" with the subtitle "distribution only" in indigo. Inside, four white cards: "Install page" / "/l/<link>: listing, steps, QR"; "Signed downloads" / "streams .ipa and .apk"; "TestFlight" / "upload, friends' group, beta review"; "iPhone signing" / "certificate and App Store profile". Under them, small grey italic text "no app code, API or database runs here".

Column 3, top to bottom: a light grey group titled "Your GitHub repository" with a code-folder icon, holding the cards "Actions" / "build, sign and deploy each release" and "Releases" / "my-app.json, CHANGELOG.md, .apk". Below it, a pale green #DCFCE7 container with a green #15803D border titled "Your Cloudflare account" holding one card "Web app files" / "served free, no request limit". Below that, a card with a key icon "Apple App Store Connect API" / "certificate, profiles, TestFlight".

Across the whole bottom: a pale green #DCFCE7 band with a green #15803D border titled "Your backend, hosted wherever you like", holding a card "REST or WebSocket API" connected by a short green line to a card with a database cylinder icon "Database and files".

Dashed indigo #4F46E5 arrows: from "Install page" to each of the three devices; from "Releases" to "Signed downloads", labelled "files"; from "Actions" to "TestFlight", labelled "upload the .ipa"; from "TestFlight" to "Apple App Store Connect API", labelled "TestFlight"; from "iPhone signing" to "Actions", labelled "certificate and profile"; from "Apple App Store Connect API" to "iPhone or iPad", labelled "TestFlight app"; from "Actions" to "Web app files", labelled "deploy". Solid green #15803D arrows: from "Any browser" to "Web app files", labelled "opens the web app"; from each of the three devices down to "REST or WebSocket API", bypassing ourapps, labelled "every launch: straight to your API". Legend at bottom left: dashed indigo line "installing and updating", solid green line "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 2. `offline.png`: offline app, no backend

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "Offline app, no backend". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Left: three device cards stacked, "iPhone", "Android phone", "Browser", each containing a small database cylinder icon with a padlock and the caption "data stays on the phone". Middle: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding the cards "Install page" and "Signed downloads". Right, top: a light grey group "Your GitHub repository" holding "Releases" / ".ipa and .apk". Right, below it: a pale green #DCFCE7 container with a green #15803D border titled "Your Cloudflare account" holding one card "Web app files".

Dashed indigo #4F46E5 arrows from "Releases" into ourapps labelled "read at install time", and from ourapps to "iPhone" and "Android phone" labelled "install and update". A solid green #15803D arrow from "Web app files" to "Browser" labelled "opens the web app". At the bottom, instead of a backend, a dotted grey outline area with a crossed-out server icon and the text "no server to run". Legend at bottom left: dashed indigo line "installing and updating", solid green line "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 3. `web-cloudflare.png`: static web app on the developer's own Cloudflare account

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "Static web app on your own Cloudflare account". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Left: a card "Your repository" / "Vite or Flutter web build" with four small monospaced file chips "index.html", "manifest.webmanifest", "install-banner.js", "_headers". A dashed indigo #4F46E5 arrow labelled "npx wrangler deploy" goes right to a pale green #DCFCE7 container with a green #15803D border titled "Your Cloudflare account", holding a card "Files-only Worker" / "<app>-web.<you>.workers.dev" and a small green pill "free, no request limit". A second dashed indigo arrow from "Your repository", labelled "release with my-app.json", goes to a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding one card "Install page" with a pill button "Open".

Right: a browser window and a phone home screen with an app icon. A dashed indigo arrow from "Install page" to the phone labelled "share link". Solid green #15803D arrows from "Files-only Worker" to the browser and to the phone, labelled "opens directly, not through ourapps". Bottom: a pale green #DCFCE7 band with a green #15803D border "Your API (optional)", with a solid green arrow from the browser labelled "CORS: allow the app's address, token auth". A small grey note card near the Worker: "the address is public: keep private data behind sign-in". Legend at bottom left: dashed indigo line "installing and updating", solid green line "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 4. `web-link.png`: web app with its own server, hosted elsewhere

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Web app hosted elsewhere". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Left: a phone and a browser window. Middle: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding one card "Install page" with a pill button "Open the web app". Right: a pale green #DCFCE7 group with a green #15803D border titled "Your host" with the subtitle "Vercel, Cloudflare Pages or your own server", holding the cards "Web app" and "Database".

A dashed indigo #4F46E5 arrow from the phone to "Install page" labelled "share link". A bold curved solid green #15803D arrow going around the ourapps container, straight from the phone and browser to "Web app", labelled "opens directly, not proxied". A small grey note under ourapps: "ourapps never sees this traffic". Legend at bottom left: dashed indigo "installing", solid green "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 5. `unity-web.png`: Unity or Godot game in the browser

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "Unity or Godot game in the browser". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Monospaced font for file names and headers. Simple 2 px line icons in slate or indigo.

Left: a card "Engine web build" listing file chips "index.html", "Build/game.loader.js", "Build/game.framework.js", "Build/game.wasm", "Build/game.data", and a separate chip "_headers" that unfolds into three monospaced lines "X-Robots-Tag: noindex", "Cross-Origin-Opener-Policy: same-origin", "Cross-Origin-Embedder-Policy: require-corp". A dashed indigo #4F46E5 arrow labelled "npx wrangler deploy" goes to a pale green #DCFCE7 container with a green #15803D border titled "Your Cloudflare account" holding a card "Files-only Worker" that shows monospaced response headers "Content-Type: application/wasm", "Content-Encoding: br (added by Cloudflare)", "isolation headers from _headers".

Top right: a small pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding one card "Install page", with dashed indigo arrows to both browsers labelled "opens the game". Right: a laptop browser and a phone browser, each with a game controller icon on screen, receiving solid green #15803D arrows from "Files-only Worker". Bottom: a pale green #DCFCE7 band with a green #15803D border "Your game server (optional)" / "multiplayer, leaderboards", connected to both browsers with solid green arrows labelled "WebSocket". A small amber #B45309 note card: "no .br or .gz files: Cloudflare compresses; 25 MB per file; phones have less memory". Legend at bottom left: dashed indigo line "installing and updating", solid green line "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 6. `realtime.png`: realtime multiplayer across all three

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "Realtime multiplayer across all three". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Centre: a simple round table drawn from circles with three player cards around it: "iPhone player", "Android player", "Browser player", each with a device icon. Below: a pale green #DCFCE7 band with a green #15803D border titled "Your game server" holding a card "WebSocket rooms" and a small database cylinder "game state". Solid green #15803D two-way arrows from each player card to "WebSocket rooms" labelled "live moves".

Left side: a compact pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" listing "installs", "iPhone signing", "update checks", connected by dashed indigo #4F46E5 arrows to the three players labelled "install once, update from the same link". Right side: a compact pale green #DCFCE7 card with a green #15803D border "Your Cloudflare account" / "web client files", with a solid green arrow to "Browser player" labelled "loads the game". Legend at bottom left: dashed indigo line "installing and updating", solid green line "playing". Generous whitespace, aligned grid, crisp edges.
```

## 7. `cross-platform.png`: one codebase, three builds

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "One codebase, three builds". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Left: one card with a code icon "Shared code" / "Flutter, React Native, Capacitor or .NET MAUI". Middle: a light grey group "GitHub Actions" with three parallel horizontal lanes: "macOS runner: .ipa (App Store)", "Linux runner: .apk (universal, signed)", "Linux runner: web build". The macOS lane ends in a pale indigo card "TestFlight" with the arrow labelled "upload through ourapps". The Linux .apk lane ends in one card "Release" with chips "my-app.json", "CHANGELOG.md", ".apk". The third lane ends in a pale green #DCFCE7 card with a green #15803D border "Your Cloudflare account" / "web app files", the arrow labelled "deploy".

Right: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding a card "One listing", fanning out with dashed indigo #4F46E5 arrows to an iPhone, an Android phone and a browser window, labelled "three install paths". A dashed indigo arrow from the ourapps container back to the macOS lane labelled "certificate and profile". Legend at bottom left: dashed indigo line "installing and updating". Generous whitespace, aligned grid, crisp edges.
```

## 8. `testflight-sequence.png`: iPhone install through TestFlight, step by step

```
Clean flat vector sequence diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "iPhone install through TestFlight, step by step". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A labels, slate grey #475569 notes, sentence case, every word spelled exactly as given.

Five lifelines with white rounded header cards and thin grey vertical dashed lines: "Your workflow", "ourapps.app" (header in pale indigo #EEF2FF with an indigo #4F46E5 border), "Apple", "Friend's iPhone", "You". Numbered horizontal messages with arrowheads, top to bottom:
1 You to Your workflow "push a tag".
2 Your workflow to ourapps "fetch certificate, key and profile".
3 Your workflow to itself "build and sign for the App Store".
4 Your workflow to ourapps "reserve an upload".
5 Your workflow to Apple "send the .ipa".
6 ourapps to Apple "add to friends' group, send for beta review".
7 Apple to ourapps "approved, invitation link".
8 Friend's iPhone to ourapps "open the share link".
9 Friend's iPhone to Apple "TestFlight: Accept, Install".
10 a note on the Friend's iPhone lifeline "app on the home screen, updates by itself".
11 ourapps to Your workflow "fresh build before 90 days".
Messages 1 to 5 and 11 in indigo #4F46E5, 6 and 7 in slate, 8 and 9 in dashed indigo. A pale indigo bracket on the right spanning messages 6 and 7 labelled "first build of a version: usually within a day". Generous whitespace, crisp edges.
```

Copyright Level N Ltd 2026.
