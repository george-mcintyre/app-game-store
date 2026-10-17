import { ApiError, api, whoAmI, type AppDetails, type HistoryEntry, type LinkPage, type Me } from "../api.js";
import { html, mount, paragraphs, raw, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { notesHtml } from "../notes.js";
import { screenshotSvg } from "../placeholders.js";
import { detectInAppBrowser, detectPlatform, itmsLink, type InAppBrowser, type Platform } from "../platform.js";
import { qrSvg, shareOrCopy } from "../qr.js";
import { setTheme } from "../theme.js";
import { appIcon, avatar, callout, copyRow, fmtDate, icon, toast, wireCopy, wireImages } from "../ui.js";

// Shared frame for every store-themed page.
export const COPYRIGHT = "Copyright Level N Ltd 2026";

export function storeFrame(body: Raw, opts: { me?: Me | null; nav?: boolean; footnote?: string } = {}): Raw {
  const right = opts.me
    ? html`<a href="/dev" class="row" style="gap:8px">${avatar(opts.me.developer.displayName, `https://github.com/${opts.me.developer.githubLogin}.png?size=64`, "sm")} <span>Console</span></a>`
    : html`<a href="/dev">For developers</a>`;
  const nav = opts.nav === false ? "" : html`<nav class="store-nav"><a class="brand" href="/">${icon("logo")} ourapps</a>${right}</nav>`;
  const footer = html`<footer class="store-footer"><span>${COPYRIGHT}</span><span>${opts.footnote ?? "Private by design. No search, no listings, no tracking."}</span></footer>`;
  return html`<div class="store fade-in">${nav}${body}${footer}</div>`;
}

function finish(root: HTMLElement): void {
  wireImages(root);
  wireCopy(root);
}

export async function landing(root: HTMLElement): Promise<void> {
  setTheme("store", "ourapps: apps we build for each other", true);
  const me = await whoAmI();
  mount(
    root,
    storeFrame(
      html`
        <section class="hero">
          <div>
            <span class="pill accent">${icon("bot", "icon-16")} Built with AI agents, shared with friends</span>
            <h1 style="margin-top:14px">Agentic programming with AI is enabling us to build apps for the people we know.</h1>
            <p class="lead">A coding agent and an evening now produce a real app for your poker table, your family, your club. Not every app belongs in an app store. ourapps is how yours gets onto their phones: send a link, they tap it, it lands on their home screen.</p>
            <div class="ctas">
              ${me ? html`<a class="btn lg" href="/dev">Open your console ${icon("arrow")}</a>` : html`<a class="btn lg" href="/api/auth/github">${icon("github")} Sign in with GitHub</a>`}
              <a class="btn lg secondary" href="/example">See an example: Poker Night</a>
            </div>
            <p class="small faint mt">Free. No accounts for friends. Works with iPhone, Android and web apps.</p>
          </div>
          <a class="phone" href="/example/poker-night" aria-label="Open the Poker Night example page">
            <div class="screen">
              <div class="mini-head">${appIcon("Poker Night", null, "md")}<div><b>Poker Night</b><span>Thursday table, house rules included</span><div class="mini-get"></div></div></div>
              <div class="mini-shot" style="background:linear-gradient(135deg,hsl(150 60% 22%),hsl(160 55% 38%))"></div>
              <div class="mini-line"></div><div class="mini-line"></div><div class="mini-line short"></div>
            </div>
          </a>
        </section>

        <section class="card pad-l" style="margin-top:4px">
          <div class="row wrap top" style="gap:20px">
            <div style="flex:1 1 300px">
              <span class="pill">Worked example</span>
              <h2 style="margin-top:8px">Poker Night: an app for eight people</h2>
              <p class="muted">Just the three options your table uses, your house rules written the way you say them, a page of help for the friend who has never played, and your own photos on the felt. Built in an evening with an agent, installed from one link.</p>
            </div>
            <div class="stack" style="flex:0 0 auto"><a class="btn" href="/example">Read the story ${icon("arrow")}</a><a class="btn secondary" href="/example/poker-night">See the install page</a></div>
          </div>
        </section>

        <section class="how" id="how">
          <div class="section-title"><h2>For your friends</h2></div>
          <div class="grid-3">
            <div class="card"><div class="num">1</div><h3>Open the link</h3><p class="muted">A link or QR code from someone they know opens an install page that looks and feels like the store they already use.</p></div>
            <div class="card"><div class="num">2</div><h3>Tap once or twice</h3><p class="muted">Android downloads straight away. iPhone registers the phone first, then installs. The page explains each step in plain words.</p></div>
            <div class="card"><div class="num">3</div><h3>It is on the home screen</h3><p class="muted">No app store, no account, no sideloading tools. Updates come from the same link.</p></div>
          </div>
          <div class="section-title"><h2>For you, the developer</h2></div>
          <div class="grid-3">
            <div class="card"><div class="num">1</div><h3>Sign in and add your app</h3><p class="muted">Name, icon, screenshots, a few lines of text. Point it at the GitHub repository that publishes releases.</p></div>
            <div class="card"><div class="num">2</div><h3>Create share links</h3><p class="muted">One per person or group, with labels, expiry and revoke. Each has a QR code.</p></div>
            <div class="card"><div class="num">3</div><h3>Approve iPhones as they arrive</h3><p class="muted">The console registers each device with Apple, rebuilds the app and tells your friend when it is ready.</p></div>
          </div>
          <div class="card mt pad-l row wrap" style="justify-content:space-between">
            <div style="flex:1 1 260px"><h3>Agents welcome</h3><p class="muted small">Everything in the console is also an API. Give your coding agent an API key and the prompt from the guide, and it can register apps, publish releases and hand you share links.</p></div>
            <a class="btn secondary" href="/agents.md">Read agents.md ${icon("external")}</a>
          </div>
        </section>
      `,
      { me },
    ),
  );
  finish(root);
}

export async function devPage(root: HTMLElement, slug: string): Promise<void> {
  setTheme("store", "ourapps");
  try {
    const [data, me] = await Promise.all([api<{ developer: { id: string; displayName: string }; apps: AppDetails[] }>("GET", `/api/public/dev/${encodeURIComponent(slug)}`), whoAmI()]);
    setTheme("store", `${data.developer.displayName} on ourapps`);
    const owner = me?.developer.id === data.developer.id;
    mount(
      root,
      storeFrame(
        html`
          ${owner ? html`<div class="owner-bar"><span class="pill">You</span> This is your public page. Apps appear here when "Show on my page" is on. <a href="/dev/apps">Manage apps</a></div>` : ""}
          <div class="dev-hero">
            ${avatar(data.developer.displayName, null, "lg")}
            <div><h1>${data.developer.displayName}</h1><p class="muted" style="margin:2px 0 0">Builds apps for friends and family.</p></div>
          </div>
          <div class="card">
            ${data.apps.length === 0 ? html`<p class="muted center" style="padding:20px 0">Nothing listed yet.</p>` : data.apps.map((a) => html`
              <div class="app-tile">${appIcon(a.name, a.iconUrl, "md")}<div><b>${a.name}</b><span>${a.tagline || "Shared privately"}</span></div><span class="pill">by invitation</span></div>
            `)}
          </div>
          <p class="small faint mt">These apps are shared privately. Ask ${data.developer.displayName} for a link if you want one.</p>
        `,
        { me },
      ),
    );
    finish(root);
  } catch (err) {
    notFound(root, err instanceof ApiError && err.status === 404 ? "No developer page here." : String(err));
  }
}

export function notFound(root: HTMLElement, message = "There is nothing at this address."): void {
  setTheme("store", "Not found");
  mount(root, storeFrame(html`<div class="card pad-l center" style="margin-top:30px"><h1>Not found</h1><p class="muted">${message}</p><a class="btn secondary mt" href="/">Go to the start</a></div>`));
}

export function inactive(root: HTMLElement): void {
  setTheme("store", "Link no longer active");
  mount(root, storeFrame(html`<div class="card pad-l center" style="margin-top:30px">${icon("lock", "icon-20")}<h1 style="margin-top:8px">This link is no longer active</h1><p class="muted">Ask the person who sent it for a new one.</p></div>`, { nav: false }));
}

export interface Detected {
  platform: Platform;
  inApp: InAppBrowser | null;
}

export function detect(): Detected {
  const ua = navigator.userAgent;
  const platform = detectPlatform(ua, navigator.platform, navigator.maxTouchPoints);
  return { platform, inApp: detectInAppBrowser(ua, platform) };
}

export async function installPage(root: HTMLElement, linkId: string): Promise<void> {
  setTheme("store", "ourapps");
  let data: LinkPage;
  try {
    data = await api<LinkPage>("GET", `/api/public/links/${encodeURIComponent(linkId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) return inactive(root);
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No app behind this link." : String(err));
  }
  const me = await whoAmI();
  renderInstall(root, data, { me, pageUrl: `${location.origin}/l/${linkId}` });
}

export async function previewPage(root: HTMLElement, appId: string): Promise<void> {
  setTheme("store", "Preview");
  try {
    const [data, me] = await Promise.all([api<LinkPage>("GET", `/api/dev/apps/${appId}/preview`), whoAmI()]);
    renderInstall(root, data, { me, pageUrl: `${location.origin}/l/preview`, preview: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return navigate("/dev");
    notFound(root, String(err));
  }
}

interface InstallOpts {
  me: Me | null;
  pageUrl: string;
  preview?: boolean;
  example?: boolean;
}

export function renderInstall(root: HTMLElement, data: LinkPage, opts: InstallOpts): void {
  const d = detect();
  const app = data.app;
  const name = app.name || data.release?.fallbackName || "App";
  const icon0 = app.iconUrl || data.release?.fallbackIcon || null;
  const description = app.description || data.release?.fallbackDescription || "";
  const shots = app.screenshots.length > 0 ? app.screenshots : (data.release?.fallbackScreenshots ?? []);
  const history = data.history ?? [];
  const whatsNew = app.whatsNew || history[0]?.notes || "";
  const owner = opts.me?.developer.id === data.developer.id;
  setTheme("store", `${name} by ${data.developer.displayName}`);

  const facts: Raw[] = [];
  if (data.release) facts.push(html`<div class="fact"><b>Version</b><span>${data.release.version}</span></div>`);
  if (app.ageNote) facts.push(html`<div class="fact"><b>Age</b><span>${app.ageNote}</span></div>`);
  if (data.release && data.release.maxPlayers > 1) facts.push(html`<div class="fact"><b>Players</b><span>${data.release.minPlayers === data.release.maxPlayers ? data.release.minPlayers : `${data.release.minPlayers} to ${data.release.maxPlayers}`}</span></div>`);
  if (app.size) facts.push(html`<div class="fact"><b>Size</b><span>${app.size}</span></div>`);
  facts.push(html`<div class="fact"><b>Developer</b><span>${data.developer.displayName}</span><small>a person you know</small></div>`);
  facts.push(html`<div class="fact"><b>Shared</b><span>Privately</span><small>by invitation</small></div>`);

  const info: [string, string][] = [
    ["Provider", data.developer.displayName],
    ["Size", app.size],
    ["Compatibility", app.minOs || compat(data)],
    ["Age", app.ageNote],
    ["Version", data.release?.version ?? ""],
    ["Updated", app.updatedAt ? new Date(app.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""],
  ];

  mount(
    root,
    storeFrame(
      html`
        ${opts.example ? html`<div class="owner-bar"><span class="pill">Example</span> This is the page a friend would get for an imaginary app. Nothing installs. <a href="/example">Why Poker Night</a> <a href="/dev">Build yours</a></div>` : ""}
        ${opts.preview ? html`<div class="owner-bar"><span class="pill">Preview</span> This is how the install page looks to a friend. Install buttons are shown but the share link does not exist yet. <a href="/dev/apps/${app.id}">Back to the app</a></div>` : ""}
        ${owner && !opts.preview && !opts.example ? html`<div class="owner-bar"><span class="pill">You</span> You are the developer of this app. <a href="/dev/apps/${app.id}">Edit</a> <a href="/dev/apps/${app.id}/links">Links</a> <a href="/dev/devices">Devices</a></div>` : ""}
        <header class="product">
          ${appIcon(name, icon0, "xl")}
          <div>
            <h1>${name}</h1>
            <p class="tagline">${app.tagline || "Made for friends and family"}</p>
            <div class="dev">${data.developer.displayName}</div>
            <div class="cta" id="cta">${ctaArea(data, d, name)}</div>
          </div>
        </header>
        <div class="facts-strip">${facts}</div>
        <div id="install-area">${installArea(data, d, name, opts.preview === true)}</div>

        <section class="store-section">
          <h2>Preview</h2>
          <div class="shots">${shots.length > 0 ? shots.map((s) => html`<img src="${s}" alt="Screenshot of ${name}" loading="lazy" />`) : [0, 1, 2].map((i) => screenshotSvg(name, app.tagline, i))}</div>
          ${shots.length === 0 ? html`<p class="sub">Screenshots coming soon.</p>` : ""}
        </section>

        <section class="store-section">
          <h2>About</h2>
          <div class="readmore" id="about">${description ? paragraphs(description) : html`<p class="muted">${name} is an app ${data.developer.displayName} built and shares privately with people they know. There is no store listing, no advertising and no account to create.</p>`}</div>
          <button class="link-btn readmore-btn" id="more" hidden>more</button>
        </section>

        ${whatsNew ? html`<section class="store-section"><h2>What's new</h2>${data.release ? html`<p class="sub">Version ${data.release.version}</p>` : ""}${notesHtml(whatsNew)}</section>` : ""}

        <section class="store-section">
          <h2>App privacy</h2>
          <div class="privacy-card">${icon("shield")}<div>${app.privacySummary ? paragraphs(app.privacySummary) : html`<p>The developer has not written a privacy summary yet. Ask ${data.developer.displayName} what the app collects and where it goes; they are a person you know, not a company.</p>`}<p class="small faint">Written by the developer, not checked by anyone else.</p></div></div>
        </section>

        ${history.length > 0 ? html`<section class="store-section"><h2>Revision history</h2>${historyBlock(history)}</section>` : ""}

        <section class="store-section">
          <h2>Information</h2>
          <div class="info-list">${info.filter(([, v]) => v).map(([k, v]) => html`<div class="item"><span class="k">${k}</span><span class="v">${v}</span></div>`)}</div>
        </section>

        <section class="store-section">
          <h2>Share</h2>
          <p class="sub">Pass this page to someone else ${data.developer.displayName} would want to have it.</p>
          <div class="share-row mt">
            <div class="qr">${qrSvg(opts.pageUrl)}</div>
            <div class="stack">
              ${copyRow(opts.pageUrl, "Copy")}
              <button class="btn secondary" id="share">${icon("share")} Share</button>
            </div>
          </div>
        </section>
      `,
      { me: opts.me, nav: true, footnote: `${name} is shared privately by ${data.developer.displayName}. Not from the App Store or Google Play.` },
    ),
  );
  finish(root);
  if (opts.example) {
    root.querySelectorAll<HTMLAnchorElement>("#cta a, #install-area a").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      toast("Example only: nothing to install");
    }));
  }

  const about = root.querySelector<HTMLElement>("#about")!;
  const more = root.querySelector<HTMLButtonElement>("#more")!;
  if (about.scrollHeight > about.clientHeight + 8) {
    more.hidden = false;
    more.onclick = () => {
      about.classList.toggle("open");
      more.textContent = about.classList.contains("open") ? "less" : "more";
    };
  } else about.classList.add("open");

  const historyEl = root.querySelector<HTMLElement>("#history");
  const moreBtn = root.querySelector<HTMLButtonElement>("#history-more");
  if (historyEl && moreBtn) {
    const latestNotes = historyEl.querySelector<HTMLElement>(".rev-notes");
    const overflows = latestNotes ? latestNotes.scrollHeight > latestNotes.clientHeight + 4 : false;
    if (history.length === 1 && !overflows) {
      moreBtn.hidden = true;
      latestNotes?.classList.remove("clamp");
    }
    moreBtn.onclick = () => {
      const open = historyEl.classList.toggle("open");
      historyEl.querySelectorAll<HTMLElement>(".rev-more").forEach((el) => (el.hidden = !open));
      latestNotes?.classList.toggle("clamp", !open);
      moreBtn.textContent = open ? "less" : "more...";
    };
  }

  root.querySelector<HTMLButtonElement>("#share")!.onclick = async () => {
    const result = await shareOrCopy(opts.pageUrl, name);
    if (result === "copied") toast("Link copied");
  };
  root.querySelectorAll<HTMLButtonElement>("[data-get]").forEach((b) => (b.onclick = () => {
    const target = root.querySelector<HTMLElement>("#install-area");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }));
  const form = root.querySelector<HTMLFormElement>("#enrol-form");
  if (form && data.linkId) form.onsubmit = (e) => startEnrolment(e, data.linkId!, form);
  if (form && !data.linkId) form.onsubmit = (e) => { e.preventDefault(); toast(opts.example ? "Example only: nothing to install" : "Preview only: create a share link to try this"); };
}

// Latest version with a clamped summary; "more..." reveals the full list.
function historyBlock(history: HistoryEntry[]): Raw {
  return html`
    <div class="history" id="history">
      ${history.map((h, i) => {
        const sha = h.sha ? html`<code title="${h.sha}">${h.sha.slice(0, 7)}</code>` : "";
        return html`
          <div class="rev ${i === 0 ? "" : "rev-more"}" ${i === 0 ? "" : raw("hidden")}>
            <div class="rev-head">
              <b>${h.version}</b>
              ${h.date ? html`<span class="muted small">${fmtDate(h.date)}</span>` : ""}
              ${h.sha ? (h.commitUrl ? html`<a class="rev-sha" href="${h.commitUrl}" target="_blank" rel="noopener" title="Commit ${h.sha}">${sha}</a>` : html`<span class="rev-sha">${sha}</span>`) : ""}
              ${h.releaseUrl ? html`<a class="small" href="${h.releaseUrl}" target="_blank" rel="noopener">release</a>` : ""}
            </div>
            ${h.title ? html`<div class="rev-title">${h.title}</div>` : ""}
            <div class="rev-notes ${i === 0 ? "clamp" : ""}">${h.notes ? notesHtml(h.notes) : html`<p class="faint">No notes for this version.</p>`}</div>
          </div>`;
      })}
      <button class="link-btn" id="history-more">more...</button>
      <p class="tiny faint">Every entry is a release of the app's code; the short code is the commit it was built from.</p>
    </div>
  `;
}

function compat(data: LinkPage): string {
  const i = data.release?.install;
  if (!i) return "";
  const parts = [];
  if (i.ios) parts.push("iPhone");
  if (i.android) parts.push("Android");
  if (i.pwa) parts.push("Web");
  return parts.join(", ");
}

// The pill button next to the icon; the detailed flow lives in installArea.
function ctaArea(data: LinkPage, d: Detected, name: string): Raw {
  if (!data.release) return html`<span class="pill warn">${icon("info", "icon-16")} No build published yet</span>`;
  const install = data.release.install;
  if (d.inApp && !d.inApp.installWorks) return html`<button class="btn get" data-get>Get</button><span class="small muted">Open in ${d.platform === "ios" ? "Safari" : "Chrome"} first</span>`;
  if (d.platform === "ios") {
    if (install.ios?.adhoc) return html`<button class="btn get" data-get>Get</button><span class="small muted">Two quick steps</span>`;
    if (install.ios?.testflight) return html`<a class="btn get" href="${install.ios.testflight}">Get</a><span class="small muted">via TestFlight</span>`;
    if (install.pwa) return html`<a class="btn get" href="${install.pwa}">Open</a><span class="small muted">web app</span>`;
    return html`<span class="pill">Not for iPhone yet</span>`;
  }
  if (d.platform === "android") {
    if (install.android) return html`<a class="btn get" href="${install.android.apk}">Get</a><span class="small muted">direct download</span>`;
    if (install.pwa) return html`<a class="btn get" href="${install.pwa}">Open</a><span class="small muted">web app</span>`;
    return html`<span class="pill">Not for Android yet</span>`;
  }
  return html`<button class="btn get" data-get>Get</button><span class="small muted">Open on your phone</span>`;
}

function installArea(data: LinkPage, d: Detected, name: string, preview: boolean): Raw {
  if (d.inApp && !d.inApp.installWorks) {
    const browser = d.platform === "ios" ? "Safari" : "Chrome";
    return callout("warn", html`
      <b>Open this page in ${browser}</b>
      <p>${d.inApp.name === "this app" ? "This app's built-in browser" : d.inApp.name} cannot install apps. Tap the menu (three dots or the share icon) and choose <b>Open in ${browser}</b>, or copy the link below and paste it into ${browser}.</p>
    `);
  }
  if (!data.release) {
    return callout("info", html`<b>${name} has no published build yet.</b><p>${data.releaseError && preview ? html`<span class="small">${data.releaseError}</span>` : "Check back soon, or ask the developer."}</p>`);
  }
  const install = data.release.install;
  if (d.platform === "ios") {
    if (install.ios?.adhoc) return iosEnrol(name);
    if (install.ios?.testflight) return html`<div class="install-card"><h3>Install through TestFlight</h3><p class="muted small">Apple's TestFlight app opens; tap Install there.</p><a class="btn block" href="${install.ios.testflight}">Open in TestFlight</a></div>`;
    if (install.pwa) return pwaSteps(install.pwa, "ios");
    return html`<div class="install-card"><h3>Not on iPhone yet</h3><p class="muted">There is no iPhone version of ${name} at the moment.</p></div>`;
  }
  if (d.platform === "android") {
    if (install.android) return androidSteps(install.android.apk, name);
    if (install.pwa) return pwaSteps(install.pwa, "android");
    return html`<div class="install-card"><h3>Not on Android yet</h3><p class="muted">There is no Android version of ${name} at the moment.</p></div>`;
  }
  return html`
    <div class="install-card">
      <h3>Open this page on your phone</h3>
      <p class="muted">Point your phone's camera at the code in the Share section below, or send yourself the link. The install happens on the phone.</p>
      ${install.pwa ? html`<p>On a computer you can use the web version: <a href="${install.pwa}">${install.pwa}</a></p>` : ""}
    </div>
  `;
}

function iosEnrol(name: string): Raw {
  return html`
    <form id="enrol-form" class="install-card">
      <h3>${icon("phone", "icon-20")} Install on this iPhone</h3>
      <p class="muted small">Apple only lets ${name} run on phones the developer has registered. Step one registers this iPhone, step two builds your copy. The page keeps you posted.</p>
      <div class="field">
        <label for="friend-name">Your name, so the developer knows whose phone this is</label>
        <input type="text" id="friend-name" name="name" required maxlength="60" autocomplete="given-name" placeholder="Sam" />
      </div>
      <button class="btn block lg" type="submit">Register this iPhone</button>
      <p class="tiny faint mt-s">A small profile downloads. Open <b>Settings</b>, tap <b>Profile Downloaded</b>, then <b>Install</b>. It tells the developer your phone's device number and nothing else.</p>
    </form>
  `;
}

async function startEnrolment(e: Event, linkId: string, form: HTMLFormElement): Promise<void> {
  e.preventDefault();
  const button = form.querySelector<HTMLButtonElement>("button")!;
  button.disabled = true;
  const name = (form.elements.namedItem("name") as HTMLInputElement).value;
  try {
    const res = await api<{ enrolmentId: string; profileUrl: string }>("POST", "/api/enrol/new", { linkId, name });
    localStorage.setItem(`enrolment:${linkId}`, res.enrolmentId);
    // Safari downloads the profile; the wait page takes over once the device has reported in.
    location.href = res.profileUrl;
    setTimeout(() => navigate(`/l/${linkId}/wait/${res.enrolmentId}`), 1500);
  } catch (err) {
    button.disabled = false;
    toast(err instanceof Error ? err.message : String(err));
  }
}

function androidSteps(apkUrl: string, name: string): Raw {
  return html`
    <div class="install-card">
      <h3>${icon("android", "icon-20")} Install on this Android phone</h3>
      <a class="btn block lg" href="${apkUrl}">Download ${name}</a>
      <p class="muted small mt">The first time, Android asks for permission because the app is not from the Play Store. This is normal for apps shared by a person.</p>
      <ol class="steps small">
        <li>When the download finishes, tap <b>Open</b> on the notification.</li>
        <li>If you see "not allowed to install unknown apps from this source", tap <b>Settings</b>, switch on <b>Allow from this source</b>, then go back.</li>
        <li>Tap <b>Install</b>.</li>
        <li>If Play Protect says it has not seen this developer before, tap <b>More details</b>, then <b>Install anyway</b>.</li>
      </ol>
    </div>
  `;
}

function pwaSteps(url: string, platform: Platform): Raw {
  const steps = platform === "ios"
    ? html`<li>Open the page in Safari.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>`
    : html`<li>Open the page in Chrome.</li><li>Tap the three-dot menu.</li><li>Choose <b>Add to Home screen</b> or <b>Install app</b>.</li>`;
  return html`
    <div class="install-card">
      <h3>${icon("globe", "icon-20")} Web app</h3>
      <a class="btn block lg" href="${url}">Open the web app</a>
      <p class="muted small mt">To keep it on your home screen:</p>
      <ol class="steps small">${steps}</ol>
    </div>
  `;
}

const STEPS = [
  { key: "register", title: "Register this iPhone", states: ["awaiting-device"] },
  { key: "approve", title: "Developer approval", states: ["pending-approval"] },
  { key: "build", title: "Build your copy", states: ["registering", "building"] },
  { key: "install", title: "Install", states: ["ready"] },
];

const WAIT_COPY: Record<string, string> = {
  "awaiting-device": "Open Settings, tap Profile Downloaded, then Install. This page updates by itself once your iPhone has reported in.",
  "pending-approval": "Your iPhone is registered with this page. The developer approves it next; this page updates by itself when they do, so you can close it and come back to the same link.",
  registering: "Registering your iPhone with Apple.",
  building: "A fresh build that includes your iPhone is on its way. This usually takes 10 to 20 minutes. You can close this page and come back to the same link.",
  ready: "Tap Install, then tap Install again when your iPhone asks. The icon appears on your home screen.",
  rejected: "The developer did not approve this iPhone. Get in touch with them if you think that is a mistake.",
  failed: "Something went wrong on the developer's side and they have been told. Try again later or get in touch with them.",
};

export async function waitPage(root: HTMLElement, linkId: string, enrolmentId: string): Promise<void> {
  setTheme("store", "Almost there");
  let since: string | undefined;
  let stopped = false;
  const render = (state: string, manifestUrl?: string, message?: string) => {
    const idx = STEPS.findIndex((s) => s.states.includes(state));
    const failed = state === "failed" || state === "rejected";
    const done = state === "ready";
    mount(
      root,
      storeFrame(
        html`
          <div class="card pad-l" style="max-width:560px;margin:24px auto">
            <h1 style="font-size:24px">${done ? "Ready to install" : failed ? (state === "rejected" ? "Not approved" : "Something went wrong") : "Almost there"}</h1>
            <p class="muted">${WAIT_COPY[state] ?? state}</p>
            ${message && state === "failed" ? html`<p class="small faint">${message}</p>` : ""}
            <ol class="timeline">
              ${STEPS.map((s, i) => {
                const cls = failed && i === Math.max(idx, 1) ? "bad" : done || i < idx ? "done" : i === idx ? "now" : "muted-step";
                const mark = cls === "done" ? icon("check", "icon-16") : cls === "now" ? html`<span class="spinner"></span>` : cls === "bad" ? "!" : String(i + 1);
                return html`<li class="${cls}"><div class="mark">${mark}</div><div><h3>${s.title}</h3><p>${cls === "now" ? "In progress" : cls === "bad" ? "Stopped here" : stepHint(s.key)}</p></div></li>`;
              })}
            </ol>
            ${done && manifestUrl ? html`<a class="btn block lg" href="${itmsLink(manifestUrl)}">Install</a><p class="tiny faint center mt-s">The install link is good for an hour; reload this page for a fresh one.</p>` : ""}
            <p class="small center mt"><a href="/l/${linkId}">Back to the app page</a></p>
          </div>
        `,
        { nav: true },
      ),
    );
  };
  const poll = async () => {
    while (!stopped) {
      try {
        const s = await api<{ state: string; manifestUrl?: string; message?: string }>("GET", `/api/enrol/${enrolmentId}/status${since ? `?since=${since}` : ""}`);
        render(s.state, s.manifestUrl, s.message);
        since = s.state;
        if (["ready", "rejected", "failed"].includes(s.state)) return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return notFound(root, "This enrolment no longer exists.");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };
  const stop = () => (stopped = true);
  addEventListener("popstate", stop, { once: true });
  addEventListener("navigate", stop, { once: true });
  render("awaiting-device");
  await poll();
}

function stepHint(key: string): string {
  switch (key) {
    case "register": return "Install the small profile from Settings.";
    case "approve": return "The developer confirms it is you.";
    case "build": return "A copy that includes your iPhone is built.";
    default: return "One tap and the icon appears.";
  }
}

export { raw };
