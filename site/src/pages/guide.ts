// The developer guide: everything from first sign-in to the first friend installing.
import { html, type Raw } from "../html.js";
import { callout, icon } from "../ui.js";
import { mountShell, requireMe } from "./shell.js";

interface Section { id: string; title: string; body: Raw; sub?: { id: string; title: string }[] }

const path = (text: string) => html`<span class="path">${text}</span>`;
const kbd = (text: string) => html`<span class="kbd">${text}</span>`;

function sections(origin: string, slug: string): Section[] {
  return [
    {
      id: "tldr",
      title: "TL;DR: what only you can do",
      body: html`
        ${callout("info", html`<p><b>Most of this guide is for your information, not your to-do list.</b> The prompts on <a href="/dev/agents">Agents and API</a> and the documents at <a href="/agents.md">agents.md</a> and <a href="/contract.md">contract.md</a> tell a coding agent everything below. Give an agent an API key and those prompts and it registers the app, sets up the repository, publishes releases, creates share links and checks devices. The steps that remain are the ones that need your identity, your money or your judgement.</p>`)}
        <h3>You, once per account</h3>
        <ol class="steps">
          <li><b>Sign in with GitHub</b> at <a href="/dev">/dev</a>. An agent cannot do this; it is your identity.</li>
          <li><b>Create a GitHub fine-grained token</b> (Contents, read and write, on your app repositories) and paste it under <a href="/dev/settings#credentials">Settings</a>. Tokens are created on GitHub while signed in as you. <a href="/dev/guide#github-token">Steps</a>.</li>
          <li><b>iPhone apps only: pay for the Apple Developer Program</b> (99 US dollars a year), then create an <b>App Store Connect API key</b> with the Admin role and paste issuer id, key id and the .p8 contents under Settings, plus your team id. <a href="/dev/guide#apple-key">Steps</a>.</li>
          <li><b>Create one API key</b> on <a href="/dev/agents">Agents and API</a> and store it where your agent runs. Keys are made from a browser session only; agents cannot mint their own.</li>
        </ol>
        <h3>You, once per iPhone app</h3>
        <ol class="steps">
          <li><b>In the Apple developer portal:</b> an App ID for the bundle id, an Apple Distribution certificate (exported as .p12 with a password), your own iPhone registered, and an <b>Ad Hoc</b> provisioning profile with a name you choose. <a href="/dev/guide#apple-setup">Steps</a>. Apple has no API for the certificate, so this stays manual.</li>
          <li><b>Put the signing secrets into the repository:</b> the .p12 as base64, its password, and for Android the keystore and its passwords. The agent can run <code>gh secret set</code> for you if you hand it the values, but the values come from you.</li>
        </ol>
        <h3>You, as things happen</h3>
        <ol class="steps">
          <li><b>Approve each new iPhone</b> under <a href="/dev/devices">Devices</a>, or tell your agent to approve by name. This is a judgement call because each approval uses one of your 100 yearly device slots.</li>
          <li><b>Send the share link</b> to the person. The agent can create it and give you the URL and QR code; the message to your friend is yours.</li>
          <li><b>Before the yearly expiry</b> (shown on each app's Latest release card), ship a build and ask friends to tap Update. The agent can cut the release.</li>
          <li><b>Approve the release notes</b> for each version in <code>CHANGELOG.md</code>. An agent drafts them from the commits; they are shown to your friends as the revision history, so the final words are yours. <a href="/dev/guide#release-notes">How</a>.</li>
        </ol>
        <h3>Everything else: hand it to an agent</h3>
        <ul class="bullets">
          <li>Registering the app with its listing text, icon and screenshots (<code>POST /api/dev/apps</code>).</li>
          <li>Writing the release workflow, my-app.json, the rebuild hook and the in-app update check in the repository (prompt 1).</li>
          <li>Storing <code>STORE_BUILD_TOKEN</code> and <code>STORE_APP_ID</code> as repository secrets.</li>
          <li>Cutting releases, checking <code>/release</code> status and fixing what it reports.</li>
          <li>Creating, labelling, revoking share links; listing waiting devices; approving the ones you name (prompt 2).</li>
        </ul>
        <p class="small muted">Rule of thumb: if it needs a password, a payment, a certificate, or a decision about a person, it is yours. If it is typing, reading a file, or calling this API, it is the agent's.</p>
      `,
    },
    {
      id: "overview",
      title: "What ourapps does",
      body: html`
        <p>ourapps puts apps you build onto the phones of people you know, without the App Store or Google Play. You add an app in this console, create a share link, and send it. Your friend taps the link and gets an install page that looks like the store they already use.</p>
        <div class="grid-2">
          <div class="card flat"><h3>${icon("android", "icon-20")} Android</h3><p>The page offers a direct download of your signed APK and walks the friend through the one-time "allow from this source" prompt. Nothing else is needed.</p></div>
          <div class="card flat"><h3>${icon("phone", "icon-20")} iPhone</h3><p>Apple only runs an app on iPhones whose device number is in the app's signing profile. The page registers the friend's iPhone, you approve it, the console registers it with Apple and asks your repository to rebuild, and the page turns into an Install button. This is Apple's Ad Hoc distribution; no review, no TestFlight, 100 iPhones per year.</p></div>
          <div class="card flat"><h3>${icon("globe", "icon-20")} Web apps</h3><p>If your my-app.json lists a web address, the page shows "Open the web app" and how to add it to the home screen.</p></div>
          <div class="card flat"><h3>${icon("lock", "icon-20")} Private by design</h3><p>No search, no listing, no index. Install pages live at random addresses, the app files are served through links that expire after an hour, and a share link can be revoked at any time.</p></div>
        </div>
        <p>The whole thing runs on free tiers. The only paid item is Apple's developer membership, which you need for iPhone apps anyway.</p>
      `,
    },
    {
      id: "sign-in",
      title: "1. Sign in",
      body: html`
        <ol class="steps">
          <li>Open <a href="${origin}/dev">${origin}/dev</a> and tap <b>Sign in with GitHub</b>. Any GitHub account works, including a free one.</li>
          <li>GitHub asks you to allow ourapps to read your public profile (scope <code>read:user</code>). That is all sign-in reads. Repository access comes later, from a token you create yourself.</li>
          <li>You land on the console. Your public page address is set from your GitHub login, for example <a href="/${slug}">${origin}/${slug}</a>. Change it and your display name under <a href="/dev/settings">Settings</a>; the display name is what friends see on every install page.</li>
        </ol>
        ${callout("info", html`<p>Sign-in lasts 30 days on a browser. Sign out from the sidebar. The console is a normal website; nothing to install.</p>`)}
      `,
    },
    {
      id: "credentials",
      title: "2. Keys the console needs (you)",
      sub: [
        { id: "github-token", title: "GitHub token" },
        { id: "apple-key", title: "App Store Connect key" },
        { id: "apple-setup", title: "One-time Apple setup" },
        { id: "android-setup", title: "Android signing" },
      ],
      body: html`
        <p>Two credentials live in <a href="/dev/settings#credentials">Settings</a>, encrypted per account. Android-only apps need just the first.</p>

        <h3 id="github-token">GitHub token (all apps)</h3>
        <p>The console reads your release files straight from GitHub Releases and, for iPhone apps, sends your repository a "rebuild now" event. Both need a token that can read and write the app repository's contents.</p>
        <ol class="steps">
          <li>On GitHub, open your avatar, ${kbd("Settings")}, ${kbd("Developer settings")}, ${kbd("Personal access tokens")}, ${kbd("Fine-grained tokens")}, ${kbd("Generate new token")}.</li>
          <li>Name it <b>ourapps</b>. Expiration: pick the longest you are comfortable with (one year) and put a reminder in your calendar.</li>
          <li><b>Repository access:</b> "Only select repositories", then pick the app repositories.</li>
          <li><b>Permissions, Repository permissions:</b> set <b>Contents</b> to <b>Read and write</b>. Metadata is added automatically. Nothing else.</li>
          <li>Generate, copy the token (it starts with <code>github_pat_</code>), paste it into <a href="/dev/settings#credentials">Settings</a> and save. The console confirms "saved" with the date.</li>
        </ol>
        ${callout("info", html`<p>When you add a new app repository later, edit the token on GitHub and add the repository to it. The console does not need a new token.</p>`)}

        <h3 id="apple-key">App Store Connect API key (iPhone apps)</h3>
        <p>This is how the console registers your friends' iPhones with Apple and rebuilds the signing profile. You need a paid Apple Developer Program membership (the same one you need to run your app on any iPhone for more than a week).</p>
        <ol class="steps">
          <li>Open <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noopener">App Store Connect, Users and Access, Integrations, App Store Connect API</a>. If you have never used it, tap <b>Request Access</b> first.</li>
          <li>Under <b>Team Keys</b>, tap the plus. Name: <b>ourapps</b>. Access: <b>Admin</b>. Devices and provisioning profiles are only editable with Admin, which is why the lower roles do not work.</li>
          <li>Tap <b>Download API Key</b>. You get a <code>.p8</code> file exactly once; keep it somewhere safe.</li>
          <li>Copy the <b>Issuer ID</b> (top of the page) and the key's <b>Key ID</b>.</li>
          <li>In <a href="/dev/settings#credentials">Settings</a> paste Issuer ID, Key ID and the full contents of the .p8 file (including the BEGIN and END lines). Save.</li>
          <li>Your <b>Team ID</b> is on <a href="https://developer.apple.com/account" target="_blank" rel="noopener">developer.apple.com/account</a> under Membership details. Paste it too.</li>
        </ol>

        <h3 id="apple-setup">One-time Apple setup per app</h3>
        <p>Done once in the <a href="https://developer.apple.com/account/resources" target="_blank" rel="noopener">Apple developer portal</a>; afterwards the console keeps the profile up to date.</p>
        <ol class="steps">
          <li><b>Identifier.</b> Identifiers, plus, App IDs, App. Bundle ID explicit, for example <code>com.yourname.skull</code>. This must match the bundle id in your Xcode project and in my-app.json.</li>
          <li><b>Distribution certificate.</b> Easiest in Xcode: ${kbd("Settings")}, ${kbd("Accounts")}, your team, ${kbd("Manage Certificates")}, plus, <b>Apple Distribution</b>. Then in Keychain Access export that certificate with its private key as a <code>.p12</code> with a password; your build workflow needs both (base64 of the file and the password) as secrets.</li>
          <li><b>Your own iPhone.</b> Devices, plus, name and UDID. Find the UDID in Finder (click the device name under the picture until it shows) or Xcode, Window, Devices and Simulators. Ad Hoc profiles need at least one device to exist.</li>
          <li><b>Ad Hoc profile.</b> Profiles, plus, <b>Ad Hoc</b>, choose the App ID, the distribution certificate, your iPhone, and give it a name such as <b>Skull Ad Hoc</b>. Generate. You never download it by hand; type the exact name into the app's "Ad Hoc provisioning profile name" field in this console.</li>
        </ol>
        ${callout("warn", html`<p>Choose <b>Ad Hoc</b>, not Development. Development profiles make iOS show "Untrusted Developer" and need a trust step in Settings; Ad Hoc apps open straight away.</p>`)}

        <h3 id="android-setup">Android signing</h3>
        <p>Android needs no account and no console credential, only a signing key your workflow uses. Create one once:</p>
        <pre><code>keytool -genkeypair -v -keystore release.keystore -alias app -keyalg RSA -keysize 2048 -validity 10000
base64 -i release.keystore | pbcopy   # paste as the secret ANDROID_KEYSTORE_BASE64</code></pre>
        <p>Keep the keystore and passwords; an APK signed with a different key cannot update an installed app. From 2026 Google is rolling out developer verification for installs on certified phones; a free "limited distribution" account covering up to 20 devices is planned. Check <a href="https://developer.android.com/developer-verification" target="_blank" rel="noopener">developer.android.com/developer-verification</a> when the time comes.</p>
      `,
    },
    {
      id: "add-app",
      title: "3. Add your app (agent can do this)",
      body: html`
        ${callout("info", html`<p><b>For your information.</b> With an API key, prompt 2 on <a href="/dev/agents">Agents and API</a> lets an agent do this whole section: it creates the app, stores the build token in the repository, and reports the app id. Read on only if you prefer the form.</p>`)}
        <p>Go to <a href="/dev/apps/new">Apps, Add an app</a>. Every field except the name and repository is optional, and blank fields get sensible placeholders, so you can add the app now and polish the listing later. What each field does:</p>
        <table class="table">
          <tr><th>Field</th><th>Shows up as</th><th>Tip</th></tr>
          <tr><td>Name, tagline, icon</td><td>The header of the install page</td><td>Icon square, 512 pixels or more, https URL. Blank icon falls back to my-app.json, then to a generated tile.</td></tr>
          <tr><td>Description</td><td>About section, with "more" when long</td><td>Say what it is and why you made it. Two or three short paragraphs beat one long one.</td></tr>
          <tr><td>What's new</td><td>Its own section, with the version</td><td>Update when you publish.</td></tr>
          <tr><td>Privacy summary</td><td>App privacy card</td><td>Plain words: what is stored, where it goes, who can see it.</td></tr>
          <tr><td>Size, compatibility, age</td><td>Facts strip and Information</td><td>Compatibility is free text, for example "iOS 17 or later".</td></tr>
          <tr><td>Screenshots</td><td>Preview carousel</td><td>Phone-shaped images, one URL per line. Blank uses the list in my-app.json, then generated previews.</td></tr>
          <tr><td>Repository</td><td>Not shown</td><td><code>owner/name</code>. The console reads the latest release here.</td></tr>
          <tr><td>Ad Hoc profile name</td><td>Not shown</td><td>Must match the profile created in step 2 exactly.</td></tr>
          <tr><td>Show on my public page</td><td>Your /${slug} page</td><td>Details only, never install links. Off by default.</td></tr>
        </table>
        <p>On <b>Create</b>, the console shows the app's <b>build token</b> once, together with the app id. Put both into the repository as Actions secrets straight away:</p>
        <ol class="steps">
          <li>On GitHub: repository, ${kbd("Settings")}, ${kbd("Secrets and variables")}, ${kbd("Actions")}, ${kbd("Repository secrets")}, ${kbd("New repository secret")}. Create <code>STORE_BUILD_TOKEN</code> and <code>STORE_APP_ID</code>.</li>
          <li>Or in a terminal inside the repository: <code>gh secret set STORE_BUILD_TOKEN</code> then <code>gh secret set STORE_APP_ID</code>, pasting the values when asked.</li>
        </ol>
        <p>Lost the token? Open the app and tap <b>New build token</b>; the old one stops working at once.</p>
        <p>Use <b>Preview install page</b> at any time to see exactly what a friend will see, with your current text and whatever the latest release provides.</p>
      `,
    },
    {
      id: "release",
      title: "4. Make the repository publish releases (agent does this)",
      sub: [{ id: "release-notes", title: "Release notes" }],
      body: html`
        ${callout("info", html`<p><b>For your information.</b> Prompt 1 on <a href="/dev/agents">Agents and API</a>, pasted into a coding agent inside the repository, writes everything in this section. What remains for you is the signing material in step 2 of the TL;DR.</p>`)}
        <p>The console never looks at your source code. It reads one file, <code>my-app.json</code>, from the latest GitHub Release of the repository, and follows the URLs inside it. Your repository therefore needs a release workflow that:</p>
        <ol class="steps">
          <li>Builds the signed APK and, for iPhone apps, the Ad Hoc signed <code>.ipa</code>.</li>
          <li>Creates a GitHub Release (not a draft, not a pre-release) and uploads: <code>my-app.json</code>, <code>icon.png</code>, screenshots, the <code>.apk</code>, and for iPhone <code>manifest.plist</code> plus the <code>.ipa</code>.</li>
          <li>Writes every URL inside my-app.json and manifest.plist as a release-asset API URL (<code>https://api.github.com/repos/owner/name/releases/assets/123</code>). Private repositories work this way and nothing is guessable; the console turns them into short-lived links for the phone.</li>
          <li>For iPhone apps: listens for the <code>my-store-rebuild</code> event, downloads the fresh profile from the console, builds, publishes, and calls <code>/api/build-ready</code>. The <a href="/contract.md">contract</a> spells out every field.</li>
        </ol>
        ${callout("info", html`<p><b>Let an agent do it.</b> On <a href="/dev/agents">Agents and API</a> there is a prompt, pre-filled for your app, that you paste into a coding agent working inside the repository. It writes the workflow, my-app.json generation and the rebuild hook to the contract.</p>`)}
        <h3>What my-app.json looks like</h3>
        <pre><code>{
  "schema": 1,
  "id": "skull",
  "name": "Skull",
  "version": "0.1.1",
  "description": "Skull-style bluffing card game for 3 to 6 friends.",
  "icon": "https://api.github.com/repos/you/skull/releases/assets/645774606",
  "minPlayers": 3,
  "maxPlayers": 6,
  "screenshots": ["https://api.github.com/repos/you/skull/releases/assets/645774610"],
  "install": {
    "pwa": null,
    "android": { "apk": "https://api.github.com/repos/you/skull/releases/assets/645774607" },
    "ios": { "bundleId": "com.you.skull", "adhoc": "https://api.github.com/repos/you/skull/releases/assets/645774612", "testflight": null }
  }
}</code></pre>
        <p>Use <code>null</code> for platforms you do not ship. <code>minPlayers</code> and <code>maxPlayers</code> are 1 for anything that is not a game.</p>
        <h3 id="release-notes">Release notes your friends will read</h3>
        <p>The install page shows a <b>Revision history</b>: one entry per release, with the version, the date, the commit it was built from, and notes. Automated bodies such as "Automated build 53 of version 0.7.2" are what friends see when nobody writes anything, so write the notes. The mechanism:</p>
        <ol class="steps">
          <li>Keep a <code>CHANGELOG.md</code> at the repository root in <a href="https://keepachangelog.com" target="_blank" rel="noopener">Keep a Changelog</a> form: one <code>## [version] - date</code> section per version, newest first, bullets written for the people who use the app. An <code>[Unreleased]</code> section at the top is fine; the store ignores it.</li>
          <li>The release workflow uploads <code>CHANGELOG.md</code> as a release asset (next to my-app.json) and uses the section for the version being released as the release body. Make the workflow fail when the section is missing, so a release without notes cannot happen by accident.</li>
          <li>The store reads the <code>CHANGELOG.md</code> from the latest release and matches sections to versions. Precedence per version: changelog section, then release body, then the commit message.</li>
        </ol>
        <pre><code># Changelog

## [Unreleased]

## [0.7.2] - 2026-10-17
### Fixed
- Dealing order when someone joins mid-round
### Changed
- Bigger chip numbers for the far end of the table

## [0.7.1] - 2026-10-16
### Added
- Rematch button</code></pre>
        <p>Headings like <code>### Added</code> become "Added:" labels on the page; bullets stay bullets; GitHub's generated "by @user in ..." and "Full Changelog" lines are dropped; links to GitHub appear only when the repository is public. The Latest release card in the console says whether the release shipped a changelog. An agent can draft the entry from the commits; the words to your friends are yours to approve.</p>

        <h3>Check it</h3>
        <p>Open the app in the console. The <b>Latest release</b> card shows the tag, the version, the platforms and the assets it found, or the exact reason it could not read the release. Tap <b>Check again</b> after you push a fix. Common reasons:</p>
        <table class="table">
          <tr><th>Message</th><th>Fix</th></tr>
          <tr><td>private repository needs a GitHub token</td><td>Save the token in Settings and make sure the repository is selected on it.</td></tr>
          <tr><td>no published release found</td><td>Publish a release that is not a draft or pre-release. The latest one is used.</td></tr>
          <tr><td>has no asset named my-app.json</td><td>The workflow must upload the file with exactly that name.</td></tr>
          <tr><td>my-app.json is invalid: ...</td><td>The message names the field. URLs must be https; schema must be 1.</td></tr>
        </table>
      `,
    },
    {
      id: "share",
      title: "5. Share with friends (agent creates the link, you send it)",
      body: html`
        <p>Open the app, tap <b>Share links</b>, give the link a label and create it, or ask your agent: "create a share link for Poker Night labelled Thursday table". The link is <code>${origin}/l/</code> followed by a random id; it does not list anywhere and search engines are told to stay away. Sending it to the person is the part that stays with you.</p>
        <h3>Good habits</h3>
        <ul class="bullets">
          <li><b>One link per person or group.</b> Labels like "Mum and Dad" or "Tuesday board game crowd" let you revoke one without touching the others.</li>
          <li><b>Expiry</b> is optional. Friends who installed keep the app when a link expires or is revoked; only new installs stop.</li>
          <li><b>QR code.</b> Each active link shows one and you can download it as a file for a printed card.</li>
        </ul>
        <h3>Sending it</h3>
        <ul class="bullets">
          <li><b>Messages, WhatsApp:</b> tap Share next to the link. On iPhone these open the page in Safari's own view, where installing works.</li>
          <li><b>Email:</b> paste the link. Gmail's built-in browser cannot install, so the page tells the friend to open it in Safari or Chrome.</li>
          <li><b>Instagram, Facebook, TikTok:</b> their in-app browsers cannot install. The page detects them and shows an "Open in Safari" instruction with the extra tap.</li>
        </ul>
        <h3>What the friend sees</h3>
        <div class="grid-2">
          <div class="card flat"><h3>On Android</h3><ol class="steps small"><li>Taps <b>Get</b>; the APK downloads.</li><li>Taps the download; Android asks to allow installs from Chrome, once.</li><li>Taps Install. Play Protect may say it has not seen this developer before; "Install anyway" continues.</li></ol></div>
          <div class="card flat"><h3>On iPhone</h3><ol class="steps small"><li>Taps <b>Get</b>, types their name, taps <b>Register this iPhone</b>.</li><li>Opens Settings, Profile Downloaded, Install. The page switches to a progress view.</li><li>You approve in Devices; the page shows "Building" then "Install". One tap, the icon appears.</li></ol></div>
        </div>
        <p>On a computer the page shows the QR code and asks them to open it on their phone.</p>
      `,
    },
    {
      id: "devices",
      title: "6. Approve iPhones (you decide, agent can execute)",
      body: html`
        <p>Every iPhone that registers through one of your links shows up in <a href="/dev/devices">Devices</a> with the name the friend typed, the phone model and its state. The overview page also counts the ones waiting for you. An agent can list who is waiting and approve the ones you name; the decision stays yours because each approval spends one of the 100 yearly slots.</p>
        <table class="table">
          <tr><th>State</th><th>Meaning</th><th>You</th></tr>
          <tr><td>awaiting device</td><td>Tapped Register, has not installed the profile yet</td><td>Nothing; remove if abandoned</td></tr>
          <tr><td>pending approval</td><td>The iPhone sent its device number</td><td><b>Approve</b> or Reject</td></tr>
          <tr><td>registering</td><td>Talking to Apple</td><td>Wait</td></tr>
          <tr><td>building</td><td>Apple accepted it; the repository was asked to rebuild</td><td>Wait for the workflow (10 to 20 minutes on a macOS runner)</td></tr>
          <tr><td>ready</td><td>The friend's page shows Install</td><td>Done</td></tr>
          <tr><td>failed</td><td>Apple or GitHub refused; the message says why</td><td>Fix the cause, Approve again</td></tr>
        </table>
        <h3>What Approve does</h3>
        <ol class="steps">
          <li>Registers the device with Apple under the friend's name (or finds it if it was registered before).</li>
          <li>Deletes and recreates the Ad Hoc profile with every enabled iPhone on your team. Apple profiles cannot be edited, only replaced; the name stays the same.</li>
          <li>Sends <code>my-store-rebuild</code> to the repository with the profile id and the new device. The workflow downloads the profile from the console with its build token.</li>
          <li>When the workflow publishes and calls <code>/api/build-ready</code>, the console marks ready every waiting device whose number is inside that profile. A device approved after the workflow had already fetched the profile is not in that build, so the console sends one more rebuild for it automatically.</li>
        </ol>
        ${callout("warn", html`<p><b>100 iPhones per membership year, across all your apps.</b> Apple counts devices on your account, not per app, and counts registrations rather than current devices: removing a device does not give the slot back until your membership renews. Approve people, not experiments, and register your own test phones once.</p>`)}
        <p><b>Approve your own iPhone first.</b> Open your share link on your phone like a friend would; you will see every screen they see and catch problems before anyone else does.</p>
      `,
    },
    {
      id: "updates",
      title: "7. Updates, auto-update and the yearly re-sign (agent does the work)",
      sub: [{ id: "auto-update", title: "Auto-update" }],
      body: html`
        <p><b>Nothing updates on its own.</b> There is no store app running in the background on your friends' phones, so an installed copy stays as it is until someone taps Update. Here is what each side does.</p>
        <table class="table">
          <tr><th>Who</th><th>What happens</th></tr>
          <tr><td>You</td><td>Bump the version, push a tag. The workflow publishes a release and the share link serves the new version at once. Existing iPhones need no approval; the signing profile already contains them.</td></tr>
          <tr><td>Friend on iPhone</td><td>Taps Update (in the app, or Get on the same share link), then Install on Apple's prompt. The app is replaced in place; settings and data stay. No new registration, no device slot used.</td></tr>
          <tr><td>Friend on Android</td><td>Taps Update, then Install when the phone asks. Data stays as long as the signing key is the same.</td></tr>
          <tr><td>Friend on a web app</td><td>Nothing. The page refreshes itself.</td></tr>
        </table>
        <ul class="bullets">
          <li><b>Version numbers must go up:</b> Android <code>versionCode</code> and iOS <code>CFBundleVersion</code>, or the phone refuses the update as "older".</li>
          <li><b>Never change the Android signing key.</b> A different key means uninstall and reinstall, with data loss.</li>
          <li><b>iPhone builds expire</b> one year after their provisioning profile was created; after that the app will not open. The app's Latest release card shows the date. Ship a build before then and ask friends to tap Update. Approving any device recreates the profile with a fresh year.</li>
          <li><b>Removing someone:</b> revoke their link. Installed copies keep working until the profile expires; there is no remote uninstall, same as any app.</li>
        </ul>

        <h3 id="auto-update">Auto-update: let the app check for itself</h3>
        <p>Phones will not check for you, but your app can. Every active share link has a small endpoint for exactly this:</p>
        <pre><code>GET https://ourapps.app/api/public/links/&lt;linkId&gt;/latest

{
  "name": "Skull",
  "version": "0.1.2",
  "ios":     { "installUrl": "itms-services://?action=download-manifest&url=https%3A%2F%2Fourapps.app%2Fdl%2F...", "manifestUrl": "https://ourapps.app/dl/...", "bundleId": "com.you.skull" },
  "android": { "apkUrl": "https://ourapps.app/dl/..." },
  "pwa": null,
  "linksExpireAt": "2026-10-16T11:00:00.000Z"
}</code></pre>
        <ol class="steps">
          <li>Create a share link labelled <b>In-app updates</b> and never revoke it (revoking it stops update checks for everyone who has the app). Put its id in the app.</li>
          <li>On launch, fetch <code>/latest</code>. Compare <code>version</code> with the running version. Do this quietly; a failed fetch means no update, not an error.</li>
          <li>If newer, show one button. iPhone: open <code>ios.installUrl</code>; iOS shows its own Install prompt and replaces the app. Android: open <code>android.apkUrl</code> in the browser; the phone downloads and asks to install.</li>
          <li>Fetch right before opening the link, because the signed links inside are good for an hour.</li>
        </ol>
        <p class="small muted">The agent prompt on <a href="/dev/agents">Agents and API</a> asks your coding agent to add this check.</p>
        <h3>Swift (iOS)</h3>
        <pre><code>struct Latest: Decodable { let version: String; let ios: IOS?; struct IOS: Decodable { let installUrl: String } }

func checkForUpdate() async {
    guard let url = URL(string: "https://ourapps.app/api/public/links/LINK_ID/latest"),
          let (data, _) = try? await URLSession.shared.data(from: url),
          let latest = try? JSONDecoder().decode(Latest.self, from: data),
          let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
          latest.version.compare(current, options: .numeric) == .orderedDescending,
          let install = latest.ios.flatMap({ URL(string: $0.installUrl) }) else { return }
    // Show your own "Update to \(latest.version)" button, then:
    await UIApplication.shared.open(install)
}</code></pre>
        <h3>Kotlin (Android)</h3>
        <pre><code>data class Latest(val version: String, val android: AndroidPart?) { data class AndroidPart(val apkUrl: String) }

suspend fun checkForUpdate(context: Context) {
    val latest = runCatching { fetchJson&lt;Latest&gt;("https://ourapps.app/api/public/links/LINK_ID/latest") }.getOrNull() ?: return
    val current = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: return
    if (!isNewer(latest.version, current) || latest.android == null) return
    // Show your own "Update to ${"$"}{latest.version}" button, then:
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(latest.android.apkUrl)))
}</code></pre>
        <p class="small muted">Android installs from the browser need the one-time "allow from this source" permission the friend already granted at first install. For a smoother in-app install, download the APK yourself and hand it to the package installer with a content URI; the one-tap confirmation remains.</p>
      `,
    },
    {
      id: "public-page",
      title: "8. Your public page",
      body: html`
        <p><a href="/${slug}">${origin}/${slug}</a> shows your display name and the apps you switched on with "Show on my public page". It is details only: no install buttons, no links, and search engines are told not to index it. Use it when someone asks "what have you built?"; hand out share links when they want one.</p>
      `,
    },
    {
      id: "agents",
      title: "9. Agents and the API (how to hand it over)",
      body: html`
        <p>Everything in this console is also an API, so a coding agent can do the repetitive parts.</p>
        <ol class="steps">
          <li>On <a href="/dev/agents">Agents and API</a>, create an API key. It is shown once; store it as the environment variable <code>OURAPPS_API_KEY</code> where the agent runs. A key acts as you, except it cannot create or revoke keys; revoke it there at any time.</li>
          <li>Copy prompt 1 into an agent working inside the app repository. It sets up the release workflow, my-app.json and the rebuild hook.</li>
          <li>Copy prompt 2 into an agent that should drive the console: register apps, check releases, make share links, approve devices you confirm.</li>
        </ol>
        <p>Reference for humans and agents: <a href="/agents.md">${origin}/agents.md</a> (endpoints, request and response shapes, workflows) and <a href="/contract.md">${origin}/contract.md</a> (what a repository must publish).</p>
        <h3>How keys and credentials are protected</h3>
        <ul class="bullets">
          <li>Each credential field is encrypted on its own (AES-256-GCM) under a key derived for your account from a secret that exists only in the server's secret store, never in the database.</li>
          <li>API keys, build tokens and sign-in sessions are stored as keyed hashes. A copy of the database cannot be used to sign in or to forge a key.</li>
          <li>API keys have a scope (read only, or manage) and an expiry. They can never create keys or change credentials; those need you in a browser.</li>
          <li>Settings, Security shows every security event on your account and has "Sign out everywhere".</li>
        </ul>
      `,
    },
    {
      id: "troubleshooting",
      title: "10. Troubleshooting",
      body: html`
        <table class="table">
          <tr><th>Symptom</th><th>Cause and fix</th></tr>
          <tr><td>No icon or version in the console, yellow notice about a GitHub token</td><td>No token saved, or the repository is not selected on it. Settings, GitHub token.</td></tr>
          <tr><td>Latest release says "no asset named my-app.json"</td><td>The workflow uploaded it under another name or to a pre-release. Names are exact; the latest non-draft, non-pre-release is used.</td></tr>
          <tr><td>Approve fails with "profile ... not found"</td><td>The Ad Hoc profile name on the app does not match the portal exactly, or the profile was never created. Step 2.</td></tr>
          <tr><td>Approve fails with "device limit reached"</td><td>100 registrations this membership year. Wait for renewal.</td></tr>
          <tr><td>Approve fails with a GitHub 404 on dispatches</td><td>The token cannot write to that repository. Edit the token on GitHub: add the repository, Contents read and write.</td></tr>
          <tr><td>Friend stuck on "Building" for over an hour</td><td>Open the repository's Actions tab. The workflow failed or did not call build-ready; its logs say why. Fix and re-run the workflow; it can call build-ready again.</td></tr>
          <tr><td>build-ready returns 409</td><td>The workflow sent a profileUuid the console did not create, usually a cached profile. Download the profile fresh from profileUrl on every run.</td></tr>
          <tr><td>iPhone says "Untrusted Developer"</td><td>The build used a Development profile. Use the Ad Hoc profile from the console; no trust step exists for Ad Hoc.</td></tr>
          <tr><td>iPhone says "Unable to Verify App" or the app will not open</td><td>The profile expired or the device is not in it. Approve the device again, which recreates the profile and rebuilds.</td></tr>
          <tr><td>Nothing happens when tapping Install on iPhone</td><td>The page is inside another app's browser (Gmail, Instagram). Open in Safari. WhatsApp and Messages are fine.</td></tr>
          <tr><td>Android says "App not installed"</td><td>An older build signed with a different key is installed. Uninstall it first, or keep the signing key stable.</td></tr>
          <tr><td>Play Protect blocks the install</td><td>Tap More details, Install anyway. If there is no such button, the device policy forbids unknown sources (work phones).</td></tr>
        </table>
      `,
    },
    {
      id: "limits",
      title: "11. Limits and costs",
      body: html`
        <ul class="bullets">
          <li><b>Apple Developer Program:</b> 99 US dollars a year. <b>100 iPhones per membership year across all your apps</b>, counted per device: eight friends on three apps use eight slots. Slots do not come back when a device is removed. Ad Hoc profiles last one year. Past 100 people, TestFlight takes 10,000 testers with 90-day builds, and the App Store has no limit.</li>
          <li><b>Android and web:</b> no device limit and no account. Google is phasing in developer verification for installs on certified phones from 2026, with a free small-distribution tier planned.</li>
          <li><b>Share links:</b> unlimited, and they only expire when you set a date.</li>
          <li><b>GitHub:</b> free. Releases are free storage; private repositories get 2,000 Actions minutes a month, and macOS minutes count ten times. A lean iOS job takes 8 to 15 minutes, so budget roughly 15 iPhone builds a month on the free tier, or run iOS builds on your own Mac.</li>
          <li><b>ourapps itself:</b> free. It runs on Cloudflare's free tier: 100,000 requests a day, which is thousands of install pages.</li>
          <li><b>File size:</b> GitHub Release assets up to 2 GB each. Phones download through the console, so keep builds reasonable for mobile data.</li>
        </ul>
      `,
    },
  ];
}

export async function guide(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  const list = sections(location.origin, me.developer.slug);
  mountShell(
    root,
    me,
    "Guide",
    html`
      <div class="guide">
        <nav class="toc" id="toc">
          ${list.map((s) => html`<a href="/dev/guide#${s.id}" data-toc="${s.id}">${s.title}</a>${(s.sub ?? []).map((x) => html`<a class="sub" href="/dev/guide#${x.id}">${x.title}</a>`)}`)}
          <hr /><a href="/agents.md">agents.md</a><a href="/contract.md">contract.md</a>
        </nav>
        <article>
          ${list.map((s) => html`<section id="${s.id}"><h2>${s.title}</h2>${s.body}</section>`)}
          <p class="small faint">Something missing or wrong? The console is open source; the repository link is on the agents page.</p>
        </article>
      </div>
    `,
    { sub: "From first sign-in to the first friend installing, in order." },
  );
  const tocLinks = [...root.querySelectorAll<HTMLAnchorElement>("[data-toc]")];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        tocLinks.forEach((a) => a.classList.toggle("active", a.dataset.toc === e.target.id));
      }
    },
    { rootMargin: "-10% 0px -80% 0px" },
  );
  root.querySelectorAll("article section").forEach((s) => observer.observe(s));
}
