import { ApiError, api, type AppDetails, type LinkPage } from "../api.js";
import { html, mount, paragraphs, raw, type Raw } from "../html.js";
import { detectInAppBrowser, detectPlatform, itmsLink, type InAppBrowser, type Platform } from "../platform.js";
import { navigate } from "../nav.js";
import { qrSvg, shareOrCopy } from "../qr.js";

export function layout(body: Raw, opts: { nav?: boolean } = {}): Raw {
  const nav = opts.nav === false ? "" : html`<nav class="top"><a class="brand" href="/">ourapps</a><span class="grow"></span><a href="/dev">Developers</a></nav>`;
  return html`${nav}<main>${body}</main>`;
}

export function landing(root: HTMLElement): void {
  mount(
    root,
    layout(html`
      <div class="card">
        <h1>Apps we built for each other</h1>
        <p>People build apps for their friends and family. This is how those apps get onto phones: the developer sends you a link or a QR code, you tap it, and the app lands on your home screen.</p>
        <p>There is nothing to browse here. If you were sent a link, open it on the phone you want the app on.</p>
      </div>
      <div class="card">
        <h2>Developers</h2>
        <p>Sign in with GitHub, add your app, create a share link, and send it to the people you built it for. Apple needs each iPhone registered first; the store handles that for you.</p>
        <a class="button" href="/api/auth/github">Sign in with GitHub</a>
      </div>
    `),
  );
}

export async function devPage(root: HTMLElement, slug: string): Promise<void> {
  try {
    const data = await api<{ developer: { displayName: string }; apps: AppDetails[] }>("GET", `/api/public/dev/${encodeURIComponent(slug)}`);
    mount(
      root,
      layout(html`
        <h1>${data.developer.displayName}</h1>
        <p class="muted">Apps this developer shares with friends. Ask them for a link if you want one.</p>
        ${data.apps.length === 0 ? html`<p class="card">Nothing listed yet.</p>` : data.apps.map(appCard)}
      `),
    );
  } catch (err) {
    notFound(root, err instanceof ApiError && err.status === 404 ? "No developer page here." : String(err));
  }
}

function appCard(app: AppDetails): Raw {
  return html`
    <div class="card row">
      ${app.iconUrl ? html`<img class="icon small" src="${app.iconUrl}" alt="" />` : html`<div class="icon small"></div>`}
      <div class="grow">
        <b>${app.name}</b>
        <div class="muted small">${app.tagline}</div>
      </div>
    </div>
  `;
}

export function notFound(root: HTMLElement, message = "There is nothing at this address."): void {
  mount(root, layout(html`<div class="card"><h1>Not found</h1><p>${message}</p></div>`));
}

export function inactive(root: HTMLElement): void {
  mount(root, layout(html`<div class="card"><h1>This link is no longer active</h1><p>Ask the person who sent it for a new one.</p></div>`, { nav: false }));
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
  let data: LinkPage;
  try {
    data = await api<LinkPage>("GET", `/api/public/links/${encodeURIComponent(linkId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) return inactive(root);
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No app behind this link." : String(err));
  }
  const d = detect();
  const app = data.app;
  const name = app.name || data.release?.fallbackName || "App";
  const icon = app.iconUrl || data.release?.fallbackIcon || "";
  const description = app.description || data.release?.fallbackDescription || "";
  const screenshots = app.screenshots.length > 0 ? app.screenshots : (data.release?.fallbackScreenshots ?? []);
  const pageUrl = `${location.origin}/l/${linkId}`;
  document.title = `${name} - ourapps`;

  mount(
    root,
    layout(
      html`
        <div class="card">
          <div class="row">
            ${icon ? html`<img class="icon" src="${icon}" alt="" />` : html`<div class="icon"></div>`}
            <div class="grow">
              <h1>${name}</h1>
              <div class="muted">${app.tagline}</div>
              <div class="muted small">${data.developer.displayName}</div>
            </div>
          </div>
          <div id="install-area" style="margin-top:16px">${installArea(data, d, name)}</div>
        </div>
        ${screenshots.length > 0 ? html`<div class="shots">${screenshots.map((s) => html`<img src="${s}" alt="" />`)}</div>` : ""}
        ${description ? html`<div class="card"><h2>About</h2>${paragraphs(description)}</div>` : ""}
        ${app.whatsNew ? html`<div class="card"><h2>What's new</h2>${paragraphs(app.whatsNew)}</div>` : ""}
        <div class="card">
          <h2>Information</h2>
          <div class="facts">
            ${data.release ? html`<div><b>Version</b>${data.release.version}</div>` : ""}
            ${app.size ? html`<div><b>Size</b>${app.size}</div>` : ""}
            ${app.minOs ? html`<div><b>Compatibility</b>${app.minOs}</div>` : ""}
            ${data.release && data.release.maxPlayers > 1 ? html`<div><b>Players</b>${data.release.minPlayers} to ${data.release.maxPlayers}</div>` : ""}
            ${app.ageNote ? html`<div><b>Age</b>${app.ageNote}</div>` : ""}
            <div><b>Developer</b>${data.developer.displayName}</div>
          </div>
        </div>
        ${app.privacySummary ? html`<div class="card"><h2>Privacy</h2>${paragraphs(app.privacySummary)}</div>` : ""}
        <div class="card">
          <h2>Share this page</h2>
          <div class="qr">${qrSvg(pageUrl)}</div>
          <p class="small muted" style="text-align:center">${pageUrl}</p>
          <button class="button secondary block" id="share">Share link</button>
        </div>
      `,
      { nav: false },
    ),
  );

  root.querySelector<HTMLButtonElement>("#share")!.onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const result = await shareOrCopy(pageUrl, name);
    b.textContent = result === "copied" ? "Link copied" : result === "shared" ? "Shared" : "Could not share";
  };
  const form = root.querySelector<HTMLFormElement>("#enrol-form");
  if (form) form.onsubmit = (e) => startEnrolment(e, linkId, form);
}

function installArea(data: LinkPage, d: Detected, name: string): Raw {
  if (d.inApp && !d.inApp.installWorks) {
    const browser = d.platform === "ios" ? "Safari" : "Chrome";
    return html`
      <div class="notice">
        <b>Open this page in ${browser}</b>
        <p>${d.inApp.name === "this app" ? "This app's built-in browser" : d.inApp.name} cannot install apps. Tap the menu (usually three dots or a share icon) and choose <b>Open in ${browser}</b>, or copy the link and paste it into ${browser}.</p>
      </div>
    `;
  }
  if (!data.release) {
    return html`<div class="error">The developer has not published a build yet.${data.releaseError ? html` <span class="small">(${data.releaseError})</span>` : ""}</div>`;
  }
  const install = data.release.install;
  if (d.platform === "ios") {
    if (install.ios?.adhoc) return iosEnrol(name);
    if (install.ios?.testflight) return html`<a class="button block" href="${install.ios.testflight}">Get it on TestFlight</a>`;
    if (install.pwa) return pwaSteps(install.pwa, "ios");
    return html`<p class="notice">There is no iPhone version of ${name} yet.</p>`;
  }
  if (d.platform === "android") {
    if (install.android) return androidSteps(install.android.apk, name);
    if (install.pwa) return pwaSteps(install.pwa, "android");
    return html`<p class="notice">There is no Android version of ${name} yet.</p>`;
  }
  const pageUrl = location.href;
  return html`
    <div class="notice">
      <b>Open this page on your phone</b>
      <p>Scan the code below with your phone's camera, or send yourself the link: <code>${pageUrl}</code></p>
      ${install.pwa ? html`<p>On a computer you can use the web version: <a href="${install.pwa}">${install.pwa}</a></p>` : ""}
    </div>
  `;
}

function iosEnrol(name: string): Raw {
  return html`
    <form id="enrol-form">
      <p><b>Two quick steps.</b> Apple only lets ${name} run on phones the developer has registered, so first this page registers your iPhone, then it builds a copy for you.</p>
      <label for="friend-name">Your name, so the developer knows whose phone this is</label>
      <input type="text" id="friend-name" name="name" required maxlength="60" autocomplete="given-name" />
      <button class="button block" type="submit" style="margin-top:12px">Register this iPhone</button>
      <p class="small muted">A small profile downloads. Open <b>Settings</b>, tap <b>Profile Downloaded</b>, then <b>Install</b>. It only tells the developer your phone's device number and removes itself.</p>
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
    alert(err instanceof Error ? err.message : String(err));
  }
}

function androidSteps(apkUrl: string, name: string): Raw {
  return html`
    <a class="button block" href="${apkUrl}">Download ${name}</a>
    <p class="small muted" style="margin-top:12px">First time only, Android asks for permission because the app is not from the Play Store:</p>
    <ol class="steps small">
      <li>When the download finishes, tap <b>Open</b> on the notification.</li>
      <li>If you see "your phone isn't allowed to install unknown apps from this source", tap <b>Settings</b>, switch on <b>Allow from this source</b>, then go back.</li>
      <li>Tap <b>Install</b>.</li>
      <li>Play Protect may say it has not seen this developer before. Tap <b>More details</b>, then <b>Install anyway</b>. The developer is a person you know, not a store.</li>
    </ol>
  `;
}

function pwaSteps(url: string, platform: Platform): Raw {
  const steps =
    platform === "ios"
      ? html`<li>Open the page in Safari.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>`
      : html`<li>Open the page in Chrome.</li><li>Tap the three-dot menu.</li><li>Choose <b>Add to Home screen</b> or <b>Install app</b>.</li>`;
  return html`
    <a class="button block" href="${url}">Open the web app</a>
    <p class="small muted" style="margin-top:12px">To keep it on your home screen:</p>
    <ol class="steps small">${steps}</ol>
  `;
}

const WAIT_COPY: Record<string, { title: string; body: string }> = {
  "awaiting-device": { title: "Finish installing the profile", body: "Open Settings, tap Profile Downloaded, then Install. This page updates by itself once your iPhone has reported in." },
  "pending-approval": { title: "Waiting for the developer", body: "Your iPhone is registered with this page. The developer now approves it; this page updates by itself when they do." },
  registering: { title: "Registering your iPhone with Apple", body: "Almost there." },
  building: { title: "Building your copy", body: "A fresh build that includes your iPhone is on its way. This usually takes 10 to 20 minutes. You can close this page and come back to the same link." },
  ready: { title: "Ready to install", body: "Tap the button, then tap Install when your iPhone asks. The icon appears on your home screen." },
  rejected: { title: "Not approved", body: "The developer did not approve this iPhone. Get in touch with them if you think that is a mistake." },
  failed: { title: "Something went wrong", body: "The developer has been told. Try again later or get in touch with them." },
};

export async function waitPage(root: HTMLElement, linkId: string, enrolmentId: string): Promise<void> {
  let since: string | undefined;
  let stopped = false;
  const render = (state: string, manifestUrl?: string, message?: string) => {
    const copy = WAIT_COPY[state] ?? { title: state, body: "" };
    mount(
      root,
      layout(
        html`
          <div class="card" style="text-align:center">
            ${["ready", "rejected", "failed"].includes(state) ? "" : html`<div class="spinner"></div>`}
            <h1>${copy.title}</h1>
            <p>${copy.body}</p>
            ${message && state === "failed" ? html`<p class="small muted">${message}</p>` : ""}
            ${state === "ready" && manifestUrl ? html`<a class="button block" href="${itmsLink(manifestUrl)}">Install</a><p class="small muted">The install link is good for an hour; reload this page for a fresh one.</p>` : ""}
            <p class="small"><a href="/l/${linkId}">Back to the app page</a></p>
          </div>
        `,
        { nav: false },
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
