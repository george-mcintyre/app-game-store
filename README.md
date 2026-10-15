# ourapps - a private installer for apps you build for friends

Nobody browses here. A developer sends a friend a link or a QR code; the friend taps it and
the app lands on their home screen. No App Store, no Google Play, no accounts for friends.

- iPhone: Apple Ad Hoc over-the-air. The friend registers their phone once (a small
  profile), the developer approves it, the app's repository builds a copy that includes
  that phone, and the friend taps Install.
- Android: a direct APK download with a one-time walkthrough of the "allow from this
  source" and Play Protect prompts.
- Web apps: an "add to home screen" walkthrough when the app lists a web version.

One Cloudflare Worker serves the site, the API and the artefact links. Data lives in D1.
Everything runs on free tiers.

## Layout

| path       | what                                                            |
|------------|-----------------------------------------------------------------|
| `worker/`  | Cloudflare Worker: sign-in, dashboard API, enrolment, build hooks, artefact proxy |
| `site/`    | Vite + TypeScript site served by the worker                      |
| `shared/`  | my-app.json validation and the enrolment state machine           |
| `CONTRACT.md` | what an app repository must implement                         |

## Add an app

1. Sign in with GitHub at `/dev`.
2. Settings: paste your App Store Connect API key (issuer id, key id, `.p8` contents), your
   Apple team id, and a GitHub fine-grained token with Contents read and write on the app's
   repository. They are stored encrypted per account.
3. Create the Ad Hoc provisioning profile once in the Apple developer portal (any name).
4. Add the app: name, repository `owner/name`, that profile name, and the App Store style
   details (tagline, description, screenshots, privacy summary). Copy the build token
   shown once into the repository secret `STORE_BUILD_TOKEN`.
5. Make the repository follow `CONTRACT.md`: publish releases with `my-app.json`, listen
   for `my-store-rebuild`, call `/api/build-ready`.
6. Create a share link for the app and send it, or show the QR code.

## Share

Each share link is `/l/<random id>`. Give it a label (who it is for), an optional expiry,
and revoke it any time. The install page detects iPhone, Android or desktop and shows the
right steps. In-app browsers (Instagram, Facebook, Gmail) cannot install; the page tells
the friend to open it in Safari or Chrome.

Your public page `/<your-slug>` lists only apps you switch on, details only, no install
links, and is marked noindex.

## Limits you must know

- Apple registers at most 100 iPhones per developer per membership year. Removing a
  device does not free the slot until renewal. Approve devices for people, not for tests.
- Ad Hoc builds stop launching when the provisioning profile expires, one year after it is
  created. Before that date, rebuild and publish a new release; friends install the update
  from the same link. The app page in the dashboard shows the current expiry.
- Install links for the APK and the manifest are signed and last one hour; the install
  page makes fresh ones every time it loads.

## Develop

```
npm install
npm test                       # shared, worker (vitest with the Cloudflare plugin), site
npm run typecheck
cd worker && npx wrangler d1 migrations apply app-game-store --local
npm run build -w site && npm run dev -w worker      # http://localhost:8787
```

Copy `worker/.dev.vars.example` to `worker/.dev.vars` for local secrets. GitHub sign-in
needs an OAuth App whose callback is `<PUBLIC_ORIGIN>/api/auth/callback`.

## Deploy

```
cd worker
npx wrangler d1 create app-game-store          # paste the id into wrangler.jsonc
npx wrangler d1 migrations apply app-game-store --remote
npx wrangler secret put LINK_SECRET
npx wrangler secret put MASTER_KEY
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npm run build -w site && npx wrangler deploy
```

`PUBLIC_ORIGIN` in `wrangler.jsonc` must match the deployed host; change it when the
custom domain is attached.
