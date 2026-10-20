import { pickScreenshots, type ScreenshotSets } from "@my/store-shared";
import { ApiError, api, whoAmI, type AppDetails, type HistoryEntry, type Install, type LinkPage, type Me } from "../api.js";
import { html, mount, paragraphs, raw, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { notesHtml } from "../notes.js";
import { buildFraction, timeLeft, usualTime } from "../progress.js";
import { installCopy, startInstall, type InstallInfo, type InstallStep } from "../install.js";
import { screenshotSvg } from "../placeholders.js";
import { appleDeviceName, detectInAppBrowser, detectPlatform, itmsLink, type InAppBrowser, type Platform } from "../platform.js";
import { qrSvg, shareOrCopy } from "../qr.js";
import { VIEW_ICON, VIEW_LABEL, availableViews, chooseView, shapeFor, showTabs, type ViewKind } from "../views.js";
import { setTheme } from "../theme.js";
import { appIcon, avatar, callout, copyRow, fmtDate, icon, toast, wireCopy, wireImages } from "../ui.js";

// Shared frame for every store-themed page.
export const COPYRIGHT = "Copyright Level N Ltd 2026";
export const SOURCE_URL = "https://github.com/george-mcintyre/ourapps";

export function storeFrame(body: Raw, opts: { me?: Me | null; nav?: boolean; footnote?: string } = {}): Raw {
  const right = opts.me
    ? html`<a href="/dev" class="row" style="gap:8px">${avatar(opts.me.developer.displayName, `https://github.com/${opts.me.developer.githubLogin}.png?size=64`, "sm")} <span>Console</span></a>`
    : html`<a href="/dev">For developers</a>`;
  const nav = opts.nav === false ? "" : html`<nav class="store-nav"><a class="brand" href="/">${icon("logo")} ourapps</a>${right}</nav>`;
  const footer = html`<footer class="store-footer"><span>${COPYRIGHT} · <a href="/terms">Terms</a></span><span>${opts.footnote ?? "Private by design. No search, no listings, no tracking."}</span></footer>`;
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
            <p class="small faint mt">Free. No accounts for friends. Works with iPhone, Android and web apps. Credentials encrypted per account, nothing sold or tracked: <a href="/dev/guide#security">how we keep it safe</a>.</p>
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

        <section class="card pad-l" style="margin-top:14px">
          <div class="row wrap top" style="gap:20px">
            <div style="flex:1 1 300px">
              <span class="pill accent">Why small is powerful</span>
              <h2 style="margin-top:8px">At eight people, the expensive parts are free</h2>
              <p class="muted">Video calls, live multiplayer, databases and AI cost a public app money every month. For a family or a group of friends they fit inside free plans: LiveKit's 5,000 free video minutes a month is about twenty one-hour calls for four, and Cloudflare's free plan runs about 80 hours of Skull a day.</p>
            </div>
            <div class="stack" style="flex:0 0 auto"><a class="btn" href="/small">How it works ${icon("arrow")}</a><a class="btn secondary" href="/free-tiers.md">The list of free services</a></div>
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
            <div class="row wrap"><a class="btn secondary" href="/reference">Technical reference</a><a class="btn secondary" href="/agents.md">Read agents.md ${icon("external")}</a></div>
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
  // "iPhone" or "iPad", used in wording on Apple devices.
  device: "iPhone" | "iPad";
}

export function detect(): Detected {
  const ua = navigator.userAgent;
  const platform = detectPlatform(ua, navigator.platform, navigator.maxTouchPoints);
  return { platform, inApp: detectInAppBrowser(ua, platform), device: appleDeviceName(ua, navigator.platform, navigator.maxTouchPoints) };
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
  // Older responses have no per-platform sets; the general list then covers everything.
  const sets: ScreenshotSets = data.screenshots ?? { all: app.screenshots.length > 0 ? app.screenshots : (data.release?.fallbackScreenshots ?? []) };
  const views = availableViews(data.release?.install, (v) => Boolean(sets[v]?.length));
  const current = chooseView(views, d.platform, d.device);
  const tabbed = showTabs(d.platform, views);
  // On a computer every version gets a panel; on a phone or tablet only the matching one.
  const shown: (ViewKind | null)[] = d.platform === "other" && views.length > 0 ? views : [current];
  const blocked = Boolean(d.inApp && !d.inApp.installWorks) || !data.release;
  const history = data.history ?? [];
  // The latest release's notes are the truth; the dashboard field only fills in when there are none.
  const latest = history.find((h) => h.version === data.release?.version) ?? history[0];
  const whatsNew = latest?.notes || app.whatsNew || "";
  const updated = latest?.date ?? (history.length === 0 ? app.updatedAt : null);
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
    ["Updated", updated ? new Date(updated).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""],
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
        ${tabbed
          ? html`<div class="platform-tabs" role="tablist" aria-label="Versions of ${name}">${views.map((v) => html`<button type="button" role="tab" id="tab-${v}" aria-controls="panel-${v}" aria-selected="${v === current ? "true" : "false"}" tabindex="${v === current ? "0" : "-1"}" data-view="${v}">${icon(VIEW_ICON[v])} ${VIEW_LABEL[v]}</button>`)}</div>`
          : ""}
        <div id="install-area">${
          blocked
            ? installArea(data, d, name, opts.preview === true)
            : shown.map((v) => html`<div ${tabbed ? html`role="tabpanel" id="panel-${v}" aria-labelledby="tab-${v}"` : ""} data-panel="${v ?? "none"}" ${tabbed && v !== current ? raw("hidden") : ""}>${installPanel(v, data, d, name, opts.pageUrl)}</div>`)
        }</div>

        <section class="store-section">
          <h2>Preview</h2>
          ${shown.map((v) => html`<div data-shots="${v ?? "none"}" ${tabbed && v !== current ? raw("hidden") : ""}>${shotsBlock(v, sets, name, app.tagline)}</div>`)}
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

  const tabs = [...root.querySelectorAll<HTMLButtonElement>(".platform-tabs [data-view]")];
  const select = (view: string, focus = false) => {
    for (const t of tabs) {
      const on = t.dataset.view === view;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    root.querySelectorAll<HTMLElement>("[data-panel], [data-shots]").forEach((el) => (el.hidden = (el.dataset.panel ?? el.dataset.shots) !== view));
  };
  tabs.forEach((t, i) => {
    t.onclick = () => select(t.dataset.view!);
    t.onkeydown = (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) select(tabs[(i + step + tabs.length) % tabs.length].dataset.view!, true);
    };
  });

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
  if (form && data.linkId) {
    form.onsubmit = (e) => startEnrolment(e, data.linkId!, form);
    // A registration started earlier in this browser carries on instead of starting a second one.
    const earlier = localStorage.getItem(`enrolment:${data.linkId}`);
    if (earlier) {
      const linkId = data.linkId;
      api<{ state: string; install?: InstallInfo }>("GET", `/api/enrol/${earlier}/status`)
        .then((s) => {
          if (["rejected", "failed"].includes(s.state)) return;
          if (s.state === "ready") return onDevice(root, form, earlier, d.device, data.release?.version ?? null, s.install);
          registering(root, form, linkId, earlier, d.device, s.state);
        })
        .catch(() => localStorage.removeItem(`enrolment:${linkId}`));
    }
  }
  if (form && !data.linkId) form.onsubmit = (e) => { e.preventDefault(); toast(opts.example ? "Example only: nothing to install" : "Preview only: create a share link to try this"); };
}

// Sets the Get button at the top of the page and the line beside it.
function setGet(root: HTMLElement, label: string, caption: string): void {
  root.querySelectorAll<HTMLButtonElement>("[data-get]").forEach((b) => {
    b.textContent = label;
    const c = b.nextElementSibling;
    if (c instanceof HTMLElement && c.matches("span.small")) c.textContent = caption;
  });
}

// A registration this browser started and has not finished: one card saying what happens next,
// in place of the form.
function registering(root: HTMLElement, form: HTMLFormElement, linkId: string, enrolmentId: string, device: string, state: string): void {
  const next =
    state === "awaiting-device"
      ? "Next: open Settings, tap Profile Downloaded, then Install."
      : state === "pending-approval"
        ? `Waiting for the developer to approve your ${device}.`
        : `Your copy is being built. This page and the progress page update by themselves.`;
  const label = state === "awaiting-device" ? "Continue" : "See progress";
  form.outerHTML = html`
    <div class="install-card" id="on-device">
      <h3>${icon("phone", "icon-20")} On this ${device}</h3>
      <p class="muted small">${next}</p>
      <a class="btn block lg" href="/l/${linkId}/wait/${enrolmentId}">${label}</a>
    </div>`.html;
  setGet(root, label, state === "awaiting-device" ? "Registration started" : state === "pending-approval" ? "Waiting for approval" : "Being built");
}

// A device this browser registered and the developer approved: install, update or install again
// without a new registration.
function onDevice(root: HTMLElement, form: HTMLFormElement, enrolmentId: string, device: string, latest: string | null, install: InstallInfo | undefined): void {
  const installed = install?.phase === "installed" ? (install.version ?? "") : null;
  const newer = installed !== null && latest !== null && installed !== "" && installed !== latest;
  const label = newer ? `Update to ${latest}` : installed !== null ? "Install again" : "Install";
  form.outerHTML = html`
    <div class="install-card" id="on-device">
      <h3>${icon("phone", "icon-20")} On this ${device}</h3>
      <p class="muted small">${installed !== null ? (installed ? `Version ${installed} is installed.` : "The app is installed.") : `Your ${device} is approved and ready to install.`}${newer ? ` Version ${latest} is out.` : ""}</p>
      <button class="btn block lg ${newer || installed === null ? "" : "secondary"}" type="button" id="install-latest">${label}</button>
      <div class="install-progress" id="install-progress" hidden></div>
    </div>`.html;
  setGet(root, newer ? "Update" : installed !== null ? "Installed" : "Install", newer ? `Version ${latest} is out` : installed !== null ? `On this ${device}` : `Ready for this ${device}`);
  const button = root.querySelector<HTMLButtonElement>("#install-latest")!;
  // An update installs the newest release; installing again uses the build made for this device.
  const manifest = newer
    ? async () => (await api<{ manifestUrl: string }>("GET", `/api/enrol/${enrolmentId}/latest`)).manifestUrl
    : async () => (await api<{ manifestUrl: string }>("GET", `/api/enrol/${enrolmentId}/status`)).manifestUrl;
  wireInstall(root, button, enrolmentId, device, manifest, install?.attemptAt ?? null, () => {
    button.textContent = "Install again";
    button.classList.add("secondary");
    button.disabled = false;
    root.querySelector<HTMLElement>("#on-device p")!.textContent = "Installed. Look for the icon on your home screen.";
    setGet(root, "Installed", `On this ${device}`);
  });
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

// "iPhone and iPad", "iPhone" or "iPad" from install.ios.devices; "iOS" when the developer makes no claim.
export function appleTargets(devices: ("iphone" | "ipad")[] | undefined): string {
  if (!devices || devices.length === 0) return "iOS";
  const names = devices.map((d) => (d === "ipad" ? "iPad" : "iPhone"));
  return names.length === 2 ? "iPhone and iPad" : names[0];
}

// A note shown on the Apple device the build was not made for; never blocks the install.
export function deviceNote(devices: ("iphone" | "ipad")[] | undefined, device: "iPhone" | "iPad"): string {
  if (!devices || devices.length === 0) return "";
  if (device === "iPad" && !devices.includes("ipad")) return "Made for iPhone. On this iPad it runs in a phone-sized window, and registering uses one of the developer's iPad slots.";
  if (device === "iPhone" && !devices.includes("iphone")) return "Made for iPad. It will not install on an iPhone; open this page on an iPad instead.";
  return "";
}

function compat(data: LinkPage): string {
  const i = data.release?.install;
  if (!i) return "";
  const parts = [];
  if (i.ios) parts.push(appleTargets(i.ios.devices));
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
    return html`<span class="pill">Not for ${d.device} yet</span>`;
  }
  if (d.platform === "android") {
    if (install.android) return html`<a class="btn get" href="${install.android.apk}">Get</a><span class="small muted">direct download</span>`;
    if (install.pwa) return html`<a class="btn get" href="${install.pwa}">Open</a><span class="small muted">web app</span>`;
    return html`<span class="pill">Not for Android yet</span>`;
  }
  return html`<button class="btn get" data-get>Get</button><span class="small muted">See the versions below</span>`;
}

// Shown instead of any version when nothing can be installed from this browser or release.
function installArea(data: LinkPage, d: Detected, name: string, preview: boolean): Raw {
  if (d.inApp && !d.inApp.installWorks) {
    const browser = d.platform === "ios" ? "Safari" : "Chrome";
    return callout("warn", html`
      <b>Open this page in ${browser}</b>
      <p>${d.inApp.name === "this app" ? "This app's built-in browser" : d.inApp.name} cannot install apps. Tap the menu (three dots or the share icon) and choose <b>Open in ${browser}</b>, or copy the link below and paste it into ${browser}.</p>
    `);
  }
  return callout("info", html`<b>${name} has no published build yet.</b><p>${data.releaseError && preview ? html`<span class="small">${data.releaseError}</span>` : "Check back soon, or ask the developer."}</p>`);
}

// One version's install steps: on the matching device they install, on a computer they point to the device.
function installPanel(view: ViewKind | null, data: LinkPage, d: Detected, name: string, pageUrl: string): Raw {
  const install = data.release!.install;
  const deviceWord = d.platform === "android" ? "Android" : d.device;
  if (view === null) return html`<div class="install-card"><h3>Not on ${deviceWord} yet</h3><p class="muted">There is no ${deviceWord} version of ${name} at the moment.</p></div>`;
  const remote = d.platform === "other";
  if (view === "web") return remote ? webOnComputer(install.pwa!, name) : pwaSteps(install.pwa!, d.platform);
  if (remote) return remoteCard(view, install, pageUrl);
  if (view === "android") return androidSteps(install.android!.apk, name);
  if (install.ios?.adhoc) return iosEnrol(name, d.device, install.ios.devices);
  return html`<div class="install-card"><h3>Install through TestFlight</h3><p class="muted small">Apple's TestFlight app opens; tap Install there.</p><a class="btn block" href="${install.ios!.testflight!}">Open in TestFlight</a></div>`;
}

function remoteCard(view: "iphone" | "ipad" | "android", install: Install, pageUrl: string): Raw {
  const device = view === "android" ? "Android phone" : VIEW_LABEL[view];
  const steps =
    view === "android"
      ? html`<li>Tap <b>Get</b>; the app downloads.</li><li>The first time, allow installs from the browser when Android asks.</li><li>Tap <b>Install</b>.</li>`
      : install.ios?.adhoc
        ? html`<li>Tap <b>Get</b> and type your name.</li><li>Install the small profile from <b>Settings</b>.</li><li>Once the developer has approved your ${device}, tap <b>Install</b>.</li>`
        : html`<li>Tap <b>Get</b>; Apple's TestFlight app opens.</li><li>Tap <b>Install</b> there.</li>`;
  return html`
    <div class="install-card remote-card">
      <div class="qr">${qrSvg(pageUrl)}</div>
      <div class="grow">
        <h3>${icon(VIEW_ICON[view], "icon-20")} Install on your ${device}</h3>
        <p class="muted small">Point the ${device}'s camera at the code, or send yourself this link, then:</p>
        <ol class="steps small">${steps}</ol>
      </div>
    </div>`;
}

function webOnComputer(url: string, name: string): Raw {
  return html`
    <div class="install-card">
      <h3>${icon("globe", "icon-20")} Web version</h3>
      <p class="muted small">Runs in this browser; nothing to install.</p>
      <a class="btn lg" href="${url}" rel="noopener">Open ${name}</a>
      <p class="small muted mt">On a phone or tablet, open this page there and add the web version to the home screen.</p>
    </div>`;
}

// The version's own screenshots, else the general list, else the closest other platform's, else generated previews.
function shotsBlock(view: ViewKind | null, sets: ScreenshotSets, name: string, tagline: string): Raw {
  const picked = pickScreenshots(view, sets);
  if (picked.urls.length === 0) {
    const shape = shapeFor(view);
    return html`<div class="shots shape-${shape}">${[0, 1, 2].map((i) => screenshotSvg(name, tagline, i, shape))}</div><p class="sub">Screenshots coming soon.</p>`;
  }
  const source = picked.source === "all" ? null : (picked.source as ViewKind);
  const shape = shapeFor(source ?? view);
  return html`${source ? html`<p class="sub">${VIEW_LABEL[source]} screenshots</p>` : ""}<div class="shots shape-${shape}">${picked.urls.map((u) => html`<img src="${u}" alt="Screenshot of ${name}" loading="lazy" />`)}</div>`;
}

function iosEnrol(name: string, device: "iPhone" | "iPad", devices?: ("iphone" | "ipad")[]): Raw {
  const note = deviceNote(devices, device);
  return html`
    <form id="enrol-form" class="install-card">
      <h3>${icon("phone", "icon-20")} Install on this ${device}</h3>
      ${devices && devices.length > 0 ? html`<p class="small muted">For ${appleTargets(devices)}.</p>` : ""}
      ${note ? callout("warn", html`<p>${note}</p>`) : ""}
      <p class="muted small">Apple only lets ${name} run on devices the developer has registered. Step one registers this ${device}, step two builds your copy. The page keeps you posted.</p>
      <div class="field">
        <label for="friend-name">Your name, so the developer knows whose ${device} this is</label>
        <input type="text" id="friend-name" name="name" required maxlength="60" autocomplete="given-name" placeholder="Sam" />
      </div>
      <button class="btn block lg" type="submit">Register this ${device}</button>
      <p class="tiny faint mt-s">A small profile downloads. Open <b>Settings</b>, tap <b>Profile Downloaded</b>, then <b>Install</b>. It tells the developer your ${device}'s device number and nothing else.</p>
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
    // The wait page comes first: a browser that blanks the page for the download can go back to it.
    navigate(`/l/${linkId}/wait/${res.enrolmentId}`);
    location.href = res.profileUrl;
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
      <a class="btn block lg" href="${url}" rel="noopener">Open the web app</a>
      <p class="muted small mt">It opens in the browser and offers to add itself to your home screen; one tap and it launches like an app from then on, and remembers permissions such as camera and microphone. If you miss the offer:</p>
      <ol class="steps small">${steps}</ol>
    </div>
  `;
}

const STEPS = [
  { key: "register", title: "Register this device", states: ["awaiting-device"] },
  { key: "approve", title: "Developer approval", states: ["pending-approval"] },
  { key: "build", title: "Build your copy", states: ["registering", "building"] },
  { key: "install", title: "Install", states: ["ready"] },
];

function waitCopy(state: string, device: string): string {
  switch (state) {
    case "awaiting-device": return `Allow the download, then open Settings, tap Profile Downloaded and tap Install. This page updates by itself once your ${device} has reported in. If the page went blank after the download, tap back.`;
    case "pending-approval": return `Your ${device} is registered with this page. The developer approves it next; this page updates by itself when they do, so you can close it and come back to the same link.`;
    case "registering": return `Registering your ${device} with Apple.`;
    case "building": return `A fresh build that includes your ${device} is on its way. You can close this page and come back to the same link.`;
    case "ready": return `Tap Install, then tap Install again when your ${device} asks. The icon appears on your home screen.`;
    case "rejected": return `The developer did not approve this ${device}. Get in touch with them if you think that is a mistake.`;
    case "failed": return "Something went wrong on the developer's side and they have been told. Try again later or get in touch with them.";
    default: return state;
  }
}

type BuildTiming = { elapsedSeconds: number; expectedSeconds: number; typicalSeconds: number | null };

function installStepHtml(step: InstallStep, device: string): string {
  const mark = step === "installed" ? icon("check", "icon-20").html : step === "nothing" ? `<b class="warn-mark">!</b>` : `<span class="spinner"></span>`;
  return `${mark}<span>${installCopy(step, device)}</span>`;
}

// The Install button and the line under it that follows the install.
function wireInstall(root: HTMLElement, button: HTMLButtonElement, enrolmentId: string, device: string, getManifest: () => Promise<string>, before: string | null, onInstalled?: (version: string | null) => void): void {
  const box = root.querySelector<HTMLElement>("#install-progress")!;
  let stop: (() => void) | null = null;
  button.onclick = async () => {
    stop?.();
    button.disabled = true;
    try {
      const manifestUrl = await getManifest();
      stop = startInstall(enrolmentId, manifestUrl, before, (step, version) => {
        box.hidden = false;
        box.className = `install-progress ${step}`;
        box.innerHTML = installStepHtml(step, device);
        if (step === "nothing") button.disabled = false;
        if (step === "installed") onInstalled?.(version);
      });
    } catch (err) {
      button.disabled = false;
      toast(err instanceof Error ? err.message : String(err));
    }
  };
}

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

// A ring that fills over the expected build time; the numbers move every second between polls.
function buildRing(build: BuildTiming): Raw {
  const f = buildFraction(build.elapsedSeconds, build.expectedSeconds);
  return html`
    <div class="build-ring" data-elapsed="${build.elapsedSeconds}" data-expected="${build.expectedSeconds}" data-t0="${performance.now()}">
      <svg viewBox="0 0 100 100" width="112" height="112" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r="${RING_R}" />
        <circle class="fill" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${(RING_C * (1 - f)).toFixed(2)}" />
        <text x="50" y="50" text-anchor="middle" dominant-baseline="central">${Math.round(f * 100)}%</text>
      </svg>
      <div><b class="left">${timeLeft(build.elapsedSeconds, build.expectedSeconds)}</b><p class="small muted">${usualTime(build.typicalSeconds)}</p></div>
    </div>`;
}

function tickRings(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".build-ring").forEach((ring) => {
    const elapsed = Number(ring.dataset.elapsed) + (performance.now() - Number(ring.dataset.t0)) / 1000;
    const expected = Number(ring.dataset.expected);
    const f = buildFraction(elapsed, expected);
    ring.querySelector(".fill")?.setAttribute("stroke-dashoffset", (RING_C * (1 - f)).toFixed(2));
    const pct = ring.querySelector("text");
    if (pct) pct.textContent = `${Math.round(f * 100)}%`;
    const left = ring.querySelector(".left");
    if (left) left.textContent = timeLeft(elapsed, expected);
  });
}

export async function waitPage(root: HTMLElement, linkId: string, enrolmentId: string): Promise<void> {
  setTheme("store", "Almost there");
  const device = detect().device;
  let since: string | undefined;
  let stopped = false;
  // Whichever browser shows this page remembers the registration for the app page.
  localStorage.setItem(`enrolment:${linkId}`, enrolmentId);
  const ticker = setInterval(() => (stopped ? clearInterval(ticker) : tickRings(root)), 1000);
  const render = (state: string, manifestUrl?: string, message?: string, build?: BuildTiming, install?: InstallInfo) => {
    const installed = state === "ready" && install?.phase === "installed";
    const idx = STEPS.findIndex((s) => s.states.includes(state));
    const failed = state === "failed" || state === "rejected";
    const done = state === "ready";
    mount(
      root,
      storeFrame(
        html`
          <div class="card pad-l" style="max-width:560px;margin:24px auto">
            <h1 style="font-size:24px" id="wait-title">${installed ? "Installed" : done ? "Ready to install" : failed ? (state === "rejected" ? "Not approved" : "Something went wrong") : "Almost there"}</h1>
            <p class="muted">${installed ? `${install?.version ? `Version ${install.version}` : "The app"} is on your home screen.` : waitCopy(state, device)}</p>
            ${build && (state === "building" || state === "registering") ? buildRing(build) : ""}
            ${message && state === "failed" ? html`<p class="small faint">${message}</p>` : ""}
            <ol class="timeline">
              ${STEPS.map((s, i) => {
                const cls = failed && i === Math.max(idx, 1) ? "bad" : done || i < idx ? "done" : i === idx ? "now" : "muted-step";
                const mark = cls === "done" ? icon("check", "icon-16") : cls === "now" ? html`<span class="spinner"></span>` : cls === "bad" ? "!" : String(i + 1);
                const title = s.key === "register" ? `Register this ${device}` : s.title;
                return html`<li class="${cls}"><div class="mark">${mark}</div><div><h3>${title}</h3><p>${cls === "now" ? "In progress" : cls === "bad" ? "Stopped here" : stepHint(s.key)}</p></div></li>`;
              })}
            </ol>
            ${state === "awaiting-device" ? html`<a class="btn block secondary" href="/api/enrol/${enrolmentId}/profile.mobileconfig">Download the profile again</a><p class="tiny faint center mt-s">Settings drops a downloaded profile that is not installed within about 8 minutes. Inside another app's browser, open this page in Safari first.</p>` : ""}
            ${done && manifestUrl ? html`<button class="btn block lg ${installed ? "secondary" : ""}" type="button" id="install-now">${installed ? "Install again" : "Install"}</button><div class="install-progress" id="install-progress" hidden></div>` : ""}
            <p class="small center mt"><a href="/l/${linkId}">Back to the app page</a></p>
          </div>
        `,
        { nav: true },
      ),
    );
    const button = root.querySelector<HTMLButtonElement>("#install-now");
    if (button && manifestUrl) {
      // A fresh link at tap time, so a page left open for hours still installs.
      const fresh = async () => (await api<{ manifestUrl?: string }>("GET", `/api/enrol/${enrolmentId}/status`)).manifestUrl ?? manifestUrl;
      wireInstall(root, button, enrolmentId, device, fresh, install?.attemptAt ?? null, (version) => {
        root.querySelector("#wait-title")!.textContent = "Installed";
        button.textContent = "Install again";
        button.classList.add("secondary");
        button.disabled = false;
        if (version) toast(`Version ${version} installed`);
      });
    }
  };
  const poll = async () => {
    while (!stopped) {
      try {
        const s = await api<{ state: string; manifestUrl?: string; message?: string; build?: BuildTiming; install?: InstallInfo }>("GET", `/api/enrol/${enrolmentId}/status${since ? `?since=${since}` : ""}`);
        render(s.state, s.manifestUrl, s.message, s.build, s.install);
        since = s.state;
        if (["ready", "rejected", "failed"].includes(s.state)) {
          clearInterval(ticker);
          return;
        }
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
