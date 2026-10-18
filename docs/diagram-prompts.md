# Diagram prompts for the technical reference

Each prompt is self-contained: paste one whole block into the image generator. Ask for 16:9,
at least 2000 by 1125 pixels, PNG. Save the result under `site/public/reference/` with the file
name shown; the reference page at `/reference` shows it automatically in place of the built-in
drawing or above the matching description card.

Image generators often misspell text. Keep the labels as given, check every word in the result,
and regenerate or touch up in an editor when a label is wrong.

Status: all eight generated (1672 by 941) and checked for spelling and technical accuracy on
2026-10-18. The PNGs are the masters; the site serves WebP copies made with
`cwebp -q 92 -m 6 <name>.png -o <name>.webp` in `site/public/reference/`. Regenerate both when
the system changes in a way a diagram shows (new install path, renamed component, new limit).

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
service ourapps is a pale indigo #EEF2FF container with a 1.5 pixel indigo #4F46E5 border. The
developer's own backend is a pale green #DCFCE7 band with a green #15803D border. Small legend at
the bottom left. Generous whitespace, aligned grid, crisp edges.

---

## 1. `architecture.png`: typical app with its own API and database, three flavours

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF at falling opacity and the white title "How a typical app is hosted and installed". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons in slate or indigo.

Four columns. Column 1 heading "Friends' devices" with three stacked cards, each with a line icon: "iPhone or iPad" / "native app (.ipa)"; "Android phone" / "native app (.apk)"; "Any browser" / "web app on the home screen".

Column 2: a tall pale indigo #EEF2FF container with a 1.5 px indigo #4F46E5 border, titled "ourapps.app" with the subtitle "distribution only" in indigo. Inside, four white cards: "Install page" / "/l/<link>: listing, steps, QR"; "Signed downloads" / "streams .ipa and .apk"; "iPhone enrolment" / "device number, Apple registration"; "Web host" / "<link>.ourapps.app, copy of web.zip". Under them, small grey italic text "no app code, API or database runs here".

Column 3 top: a light grey group titled "Your GitHub repository" with a code-folder icon, holding the cards "Actions" / "build and sign each release" and "Releases" / "my-app.json, CHANGELOG.md, .ipa + manifest.plist, .apk, web.zip". Column 3 bottom: a card with a key icon "Apple App Store Connect API" / "devices and Ad Hoc profiles".

Across the whole bottom: a pale green #DCFCE7 band with a green #15803D border titled "Your backend, hosted wherever you like", holding a card "REST or WebSocket API" connected by a short green line to a card with a database cylinder icon "Database and files".

Dashed indigo #4F46E5 arrows: from "Install page" to each of the three devices; from "Releases" to "Signed downloads" and to "Web host", labelled "files"; from "iPhone enrolment" to "Apple App Store Connect API", labelled "register device"; from the ourapps container to "Actions", labelled "rebuild". Solid green #15803D arrows from each of the three devices down to "REST or WebSocket API", bypassing ourapps, labelled "every launch: straight to your API". Legend at bottom left: dashed indigo line "installing and updating", solid green line "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 2. `offline.png`: offline app, no backend

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Offline app, no backend". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Left: three device cards stacked, "iPhone", "Android phone", "Browser", each containing a small database cylinder icon with a padlock and the caption "data stays on the phone". Middle: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding the cards "Install page" and "Signed downloads". Right: a light grey group "Your GitHub repository" holding "Releases" / ".ipa, .apk, web.zip".

Dashed indigo #4F46E5 arrows from "Releases" into ourapps labelled "read at install time", and from ourapps to each device labelled "install and update". At the bottom, instead of a backend, a dotted grey outline area with a crossed-out server icon and the text "no server to run". Legend at bottom left: dashed indigo line "installing and updating". Generous whitespace, aligned grid, crisp edges.
```

## 3. `web-bundle.png`: static web app served by ourapps

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Static web app served by ourapps". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Left: card "Your repository" / "Vite or Flutter web build", an arrow labelled "zip -0" to a file icon "web.zip" sitting on a card "Release". A dashed indigo #4F46E5 arrow labelled "first request after a release" goes into a wide pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app". Inside it, left to right: a small step "unpack once", a storage cylinder labelled "storage" holding three small boxes "pack 1", "pack 2", "pack 3", then a lightning icon "edge cache", then a globe icon labelled "<link>.ourapps.app".

Right: a browser window and a phone home screen with an app icon, each receiving solid green #15803D arrows from the globe labelled "HTML no-cache, files cached a day". Bottom: a pale green #DCFCE7 band with a green #15803D border "Your API (optional)", with a solid green arrow from the browser labelled "CORS: allow the link origins, token auth". A small grey note card near the globe: "storage, service worker and permissions belong to each link's origin". Legend at bottom left: dashed indigo "installing and updating", solid green "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 4. `web-link.png`: web app hosted elsewhere

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Web app hosted elsewhere". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Left: a phone and a browser window. Middle: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding one card "Install page" with a pill button "Open the web app". Right: a pale green #DCFCE7 group with a green #15803D border titled "Your host" with the subtitle "Vercel, Cloudflare Pages or your own server", holding the cards "Web app" and "Database".

A dashed indigo #4F46E5 arrow from the phone to "Install page" labelled "share link". A bold curved solid green #15803D arrow going around the ourapps container, straight from the phone and browser to "Web app", labelled "opens directly, not proxied". A small grey note under ourapps: "ourapps never sees this traffic". Legend at bottom left: dashed indigo "installing", solid green "using the app". Generous whitespace, aligned grid, crisp edges.
```

## 5. `unity-web.png`: Unity or Godot game in the browser

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Unity or Godot game in the browser". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Monospaced font for file names and headers.

Left: a card "Engine web build" listing file chips "index.html", "Build/game.loader.js", "Build/game.framework.js.br", "Build/game.wasm.br", "Build/game.data.br", and a separate chip "_headers" that unfolds into three monospaced lines "Cross-Origin-Opener-Policy: same-origin", "Cross-Origin-Embedder-Policy: require-corp", "Cross-Origin-Resource-Policy: cross-origin". A dashed indigo #4F46E5 arrow labelled "web.zip" into a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding a card "Web host" that shows monospaced response headers "Content-Encoding: br", "Content-Type: application/wasm", "isolation headers from _headers".

Right: a laptop browser and a phone browser, each with a game controller icon on screen, receiving solid green #15803D arrows from "Web host". Bottom: a pale green #DCFCE7 band with a green #15803D border "Your game server (optional)" / "multiplayer, leaderboards", connected to both browsers with solid green arrows labelled "WebSocket". A small amber #B45309 note card: "limit: 32 MB unpacked; phones have less memory". Legend at bottom left. Generous whitespace, aligned grid, crisp edges.
```

## 6. `realtime.png`: realtime multiplayer across all three

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "Realtime multiplayer across all three". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Centre: a simple round table drawn from circles with three player cards around it: "iPhone player", "Android player", "Browser player", each with a device icon. Below: a pale green #DCFCE7 band with a green #15803D border titled "Your game server" holding a card "WebSocket rooms" and a small database cylinder "game state". Solid green #15803D two-way arrows from each player card to "WebSocket rooms" labelled "live moves".

Left side: a compact pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" listing "installs", "web client host", "update checks", connected by dashed indigo #4F46E5 arrows to the three players labelled "install once, update from the same link". Legend at bottom left: dashed indigo "installing and updating", solid green "playing". Generous whitespace, aligned grid, crisp edges.
```

## 7. `cross-platform.png`: one codebase, three builds

```
Clean flat vector technical diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. White rounded cards (radius about 16 px) with 1 px light grey borders #E2E8F0 and a very soft shadow. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "One codebase, three builds". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A titles, slate grey #475569 subtitles, sentence case, every word spelled exactly as given. Simple 2 px line icons.

Left: one card with a code icon "Shared code" / "Flutter, React Native, Capacitor or .NET MAUI". Middle: a light grey group "GitHub Actions" with three parallel horizontal lanes: "macOS runner: .ipa (Ad Hoc)", "Linux runner: .apk (universal, signed)", "Linux runner: web.zip". The three lanes merge into one card "Release" with chips "my-app.json", "CHANGELOG.md", ".ipa + manifest.plist", ".apk", "web.zip".

Right: a pale indigo #EEF2FF container with an indigo #4F46E5 border titled "ourapps.app" holding a card "One listing", fanning out with dashed indigo #4F46E5 arrows to an iPhone, an Android phone and a browser window, labelled "three install paths". Legend at bottom left: dashed indigo "installing and updating". Generous whitespace, aligned grid, crisp edges.
```

## 8. `iphone-sequence.png`: iPhone install, step by step

```
Clean flat vector sequence diagram for a developer documentation site, 16:9, two-dimensional, no perspective, no 3D, no photorealism, no people, no brand logos. Light background #F3F5FA. A deep navy #0B1226 band across the top with a small logo of four rounded squares in indigo #8B85FF and the white title "iPhone install, step by step". Typography: modern geometric sans serif like Inter, bold dark slate #0F172A labels, slate grey #475569 notes, sentence case, every word spelled exactly as given.

Five lifelines with white rounded header cards and thin grey vertical dashed lines: "Friend's iPhone", "ourapps.app" (header in pale indigo #EEF2FF with an indigo #4F46E5 border), "You", "Apple", "Your workflow". Numbered horizontal messages with arrowheads, top to bottom:
1 iPhone to ourapps "Register, with a name".
2 ourapps to iPhone "enrolment profile: UDID, model, iOS version only".
3 iPhone to ourapps "signed device details".
4 ourapps to You "iPhone waiting for approval".
5 You to ourapps "Approve".
6 ourapps to Apple "register device".
7 ourapps to Apple "recreate Ad Hoc profile with all devices".
8 ourapps to Your workflow "rebuild request".
9 Your workflow to ourapps "download profile".
10 Your workflow to itself "build, sign, publish release".
11 Your workflow to ourapps "build ready, with profile uuid".
12 ourapps to iPhone "Install link, signed for one hour".
13 a note on the iPhone lifeline "app on the home screen".
Messages 1 to 3 and 12 in dashed indigo #4F46E5, 6 and 7 in slate, 8 to 11 in indigo, 4 and 5 in amber #B45309. A pale indigo bracket on the right spanning messages 6 to 11 labelled "about 10 to 20 minutes". Generous whitespace, crisp edges.
```

Copyright Level N Ltd 2026.
