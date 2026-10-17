import { ApiError, api, type ApiKey, type AuditEvent, type DevApp, type Enrolment, type Me, type ReleaseStatus, type ShareLink } from "../api.js";
import { html, raw, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { qrSvg, shareOrCopy } from "../qr.js";
import { appIcon, callout, copyRow, copyText, emptyState, errorBox, fmtDate, icon, pill, statePill, toast, wireCopy, wireImages } from "../ui.js";
import { AGENT_REPO_PROMPT, AGENT_STORE_PROMPT } from "./prompts.js";
import { failed, mountShell, requireMe } from "./shell.js";

type Ctx = { root: HTMLElement; me: Me };

function showError(root: HTMLElement, err: unknown, selector = "#error"): void {
  const box = root.querySelector<HTMLElement>(selector);
  if (box) box.innerHTML = errorBox(err).html;
  else toast(err instanceof Error ? err.message : String(err));
}

async function confirmAction(message: string): Promise<boolean> {
  return confirm(message);
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export async function dashboard(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  try {
    const [{ apps }, { enrolments }] = await Promise.all([api<{ apps: DevApp[] }>("GET", "/api/dev/apps"), api<{ enrolments: Enrolment[] }>("GET", "/api/dev/devices")]);
    const releases = await Promise.all(apps.slice(0, 6).map((a) => api<ReleaseStatus>("GET", `/api/dev/apps/${a.id}/release`).catch(() => null)));
    const links = await Promise.all(apps.map((a) => api<{ links: ShareLink[] }>("GET", `/api/dev/apps/${a.id}`).then((r) => r.links).catch(() => [] as ShareLink[])));
    const now = Date.now();
    const activeLinks = links.flat().filter((l) => !l.revokedAt && (!l.expiresAt || Date.parse(l.expiresAt) > now)).length;
    const pending = enrolments.filter((e) => e.state === "pending-approval");
    const ready = enrolments.filter((e) => e.state === "ready").length;
    const anyRelease = releases.some((r) => r?.ok);
    const needsIos = releases.some((r) => r?.install?.ios) || apps.some((a) => a.profileName);

    const steps: { done: boolean; title: string; why: string; href: string; cta: string; optional?: boolean }[] = [
      { done: true, title: "Sign in with GitHub", why: "Done. Your page is /" + me.developer.slug + ".", href: "/dev/settings", cta: "Profile" },
      { done: me.secrets.github, title: "Save a GitHub token", why: "Lets the console read releases from private repositories and ask them to rebuild.", href: "/dev/settings#credentials", cta: "Settings" },
      { done: me.secrets.apple, title: "Save your App Store Connect key", why: needsIos ? "Needed to register friends' iPhones with Apple." : "Only needed for iPhone apps.", href: "/dev/settings#credentials", cta: "Settings", optional: !needsIos },
      { done: apps.length > 0, title: "Add your first app", why: "Name, icon, a few lines, and the repository that publishes it.", href: "/dev/apps/new", cta: "Add app" },
      { done: anyRelease, title: "Publish a release the console can read", why: "A GitHub Release with my-app.json and the app files. The guide and the agent prompt show exactly how.", href: apps[0] ? `/dev/apps/${apps[0].id}` : "/dev/guide#release", cta: apps[0] ? "Check release" : "Guide" },
      { done: activeLinks > 0, title: "Create a share link", why: "Each link is private, has a QR code and can be revoked.", href: apps[0] ? `/dev/apps/${apps[0].id}/links` : "/dev/apps", cta: "Links" },
      { done: ready > 0, title: "Get the first iPhone installed", why: needsIos ? "Approve the device when it appears; the console does the rest." : "Not needed for Android or web apps.", href: "/dev/devices", cta: "Devices", optional: !needsIos },
    ];
    const required = steps.filter((s) => !s.optional);
    const doneCount = required.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done);

    mountShell(
      root,
      me,
      `Hello, ${me.developer.displayName.split(" ")[0]}`,
      html`
        <div class="stats">
          <div class="stat"><b>${apps.length}</b><span>app${apps.length === 1 ? "" : "s"}</span></div>
          <div class="stat"><b>${activeLinks}</b><span>active share link${activeLinks === 1 ? "" : "s"}</span></div>
          <div class="stat"><b>${pending.length}</b><span>iPhone${pending.length === 1 ? "" : "s"} waiting for approval</span>${pending.length > 0 ? html`<div class="delta">needs you</div>` : ""}</div>
          <div class="stat"><b>${ready}</b><span>device${ready === 1 ? "" : "s"} ready to install</span></div>
        </div>

        ${pending.length > 0 ? html`<div class="card mt" style="border-color:var(--warn)"><div class="row wrap"><div class="grow"><h2>${pending.length === 1 ? "An iPhone is waiting" : `${pending.length} iPhones are waiting`}</h2><p class="muted small">${pending.map((p) => p.name).join(", ")} registered and ${pending.length === 1 ? "needs" : "need"} your approval before Apple will allow the app on ${pending.length === 1 ? "their phone" : "their phones"}.</p></div><a class="btn" href="/dev/devices">Review devices ${icon("arrow")}</a></div></div>` : ""}

        <div class="grid-2 mt">
          <div class="card">
            <div class="row"><h2 class="grow">Setup</h2><span class="pill ${doneCount === required.length ? "ok" : "accent"}">${doneCount} of ${required.length}</span></div>
            <div class="progress"><i style="width:${Math.round((doneCount / required.length) * 100)}%"></i></div>
            ${next ? html`<p class="small muted">Next: <b>${next.title}</b>. ${next.why}</p>` : html`<p class="small muted">Everything is set up. Share links and approve devices as friends arrive.</p>`}
            <ul class="checklist">
              ${steps.map((s) => html`<li class="${s.done ? "done" : ""}"><span class="tick">${s.done ? icon("check", "icon-16") : ""}</span><div class="what"><b>${s.title}${s.optional ? html` <span class="pill">optional</span>` : ""}</b><span>${s.why}</span></div>${s.done ? "" : html`<a class="btn sm ${s === next ? "" : "secondary"}" href="${s.href}">${s.cta}</a>`}</li>`)}
            </ul>
          </div>
          <div class="stack">
            <div class="card">
              <div class="row"><h2 class="grow">Apps</h2><a class="btn sm" href="/dev/apps/new">${icon("plus")} Add</a></div>
              ${apps.length === 0 ? emptyState("apps", "No apps yet", "Add the first one; it takes two minutes.", html`<a class="btn mt-s" href="/dev/apps/new">Add an app</a>`) : html`<div class="list">${apps.map((a, i) => appRow(a, releases[i] ?? null))}</div>`}
            </div>
            <div class="card">
              <h2>${icon("shield", "icon-20")} Security in one paragraph</h2>
              <p class="small muted">Your Apple key and GitHub token are encrypted per account with keys derived from a secret that lives only in the server's secret store; API keys, build tokens and sessions are stored as keyed hashes; credential changes need you in a browser; friends' iPhone records are visible to you alone and sent only to Apple under your account. <a href="/dev/guide#security">Full description</a>, <a href="/terms">terms and data statement</a>, and recent activity under <a href="/dev/settings#security">Settings</a>.</p>
            </div>
            <div class="card">
              <h2>Learn and automate</h2>
              <p class="small muted">The <a href="/dev/guide#tldr">guide's TL;DR</a> lists the few things only you can do (sign in, tokens, Apple portal, approvals). Everything else an agent does with the API key and prompts on the <a href="/dev/agents">agents page</a>.</p>
            </div>
          </div>
        </div>
      `,
      { sub: "Your private app store for friends and family." },
    );
  } catch (err) {
    failed(root, me, err);
  }
}

function appRow(a: DevApp, r: ReleaseStatus | null): Raw {
  const state = r === null ? pill("checking", "") : r.ok ? pill(`v${r.version}`, "ok", true) : pill("no release", "warn", true);
  return html`<li class="row"><a href="/dev/apps/${a.id}">${appIcon(a.name, a.iconUrl || a.releaseIcon, "sm")}</a><div class="grow"><a href="/dev/apps/${a.id}"><b>${a.name}</b></a><div class="small muted">${a.repo}</div></div>${state}<a class="btn sm secondary" href="/dev/apps/${a.id}/links">Links</a></li>`;
}

/* ------------------------------------------------------------------ */
/* Apps list                                                           */
/* ------------------------------------------------------------------ */

export async function appsPage(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  try {
    const { apps } = await api<{ apps: DevApp[] }>("GET", "/api/dev/apps");
    mountShell(
      root,
      me,
      "Apps",
      apps.length === 0
        ? html`<div class="card">${emptyState("apps", "No apps yet", "An app is a name, an icon, a few lines and the GitHub repository that publishes it.", html`<a class="btn mt-s" href="/dev/apps/new">Add your first app</a>`)}</div>`
        : html`<div class="app-grid">${apps.map((a) => html`
            <div class="app-card">
              ${appIcon(a.name, a.iconUrl || a.releaseIcon, "md")}
              <div>
                <div class="name">${a.name}</div>
                <div class="meta"><span>${a.repo}</span>${a.showOnPage ? pill("on your page", "accent") : ""}</div>
                <div class="small muted" style="margin-top:4px">${a.tagline || "No tagline yet"}</div>
                <div class="actions"><a class="btn sm" href="/dev/apps/${a.id}">Edit</a><a class="btn sm secondary" href="/dev/apps/${a.id}/links">Share links</a><a class="btn sm ghost" href="/dev/apps/${a.id}/preview">Preview</a></div>
              </div>
            </div>`)}</div>`,
      { sub: "Each app has its own listing, build token and share links.", actions: html`<a class="btn" href="/dev/apps/new">${icon("plus")} Add an app</a>` },
    );
  } catch (err) {
    failed(root, me, err);
  }
}

/* ------------------------------------------------------------------ */
/* App form                                                            */
/* ------------------------------------------------------------------ */

type FieldKey = "name" | "tagline" | "iconUrl" | "description" | "whatsNew" | "privacySummary" | "size" | "minOs" | "ageNote" | "repo" | "profileName" | "manifestUrl";
interface Field { key: FieldKey; label: string; type: "text" | "url" | "textarea"; hint?: string; placeholder?: string; required?: boolean }

const SECTIONS: { title: string; about: string; fields: Field[] }[] = [
  {
    title: "Listing",
    about: "What a friend sees first: icon, name and one line. Anything you leave blank gets a tasteful placeholder, so a bare entry still looks finished.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "Skull" },
      { key: "tagline", label: "Tagline", type: "text", placeholder: "Bluff your friends, lose your skull", hint: "One line under the name." },
      { key: "iconUrl", label: "Icon URL", type: "url", placeholder: "https://...", hint: "Square, 512 pixels or more. Leave blank to use the icon from my-app.json or a generated one." },
    ],
  },
  {
    title: "Story",
    about: "The text of the store page. Write like you are telling a friend what it is and why you made it.",
    fields: [
      { key: "description", label: "Description", type: "textarea", placeholder: "A quick bluffing card game for 3 to 6 people, played on your own phones around a table." },
      { key: "whatsNew", label: "What's new", type: "textarea", placeholder: "Faster dealing, bigger buttons, a rematch option.", hint: "Only shown when the latest release has no notes. Release notes from CHANGELOG.md take precedence; see the guide." },
      { key: "privacySummary", label: "Privacy summary", type: "textarea", placeholder: "Stores your chosen nickname on your phone only. Game moves go through my server and are deleted when the table closes.", hint: "In your own words: what the app collects and where it goes." },
    ],
  },
  {
    title: "Facts",
    about: "Small details shown in the Information section.",
    fields: [
      { key: "size", label: "Size", type: "text", placeholder: "24 MB" },
      { key: "minOs", label: "Compatibility", type: "text", placeholder: "iOS 17 or later, Android 10 or later" },
      { key: "ageNote", label: "Age note", type: "text", placeholder: "12+" },
    ],
  },
  {
    title: "Build and publishing",
    about: "Where the console reads releases from and how it asks for iPhone rebuilds. The repository must follow the contract; the agent prompt sets it up for you.",
    fields: [
      { key: "repo", label: "GitHub repository", type: "text", required: true, placeholder: "owner/name", hint: "The latest release on this repository must carry an asset named my-app.json." },
      { key: "profileName", label: "Ad Hoc provisioning profile name", type: "text", placeholder: "Skull Ad Hoc", hint: "iPhone only. Create the profile once in the Apple developer portal; the console recreates it with every new device." },
      { key: "manifestUrl", label: "my-app.json URL", type: "url", hint: "Only when the file is hosted somewhere other than the repository's releases." },
    ],
  },
];

export async function appForm(root: HTMLElement, appId: string | null): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  let app: Partial<DevApp> = { screenshots: [], showOnPage: false };
  let links: ShareLink[] = [];
  let release: ReleaseStatus | null = null;
  if (appId) {
    try {
      const detail = await api<{ app: DevApp; links: ShareLink[] }>("GET", `/api/dev/apps/${appId}`);
      app = detail.app;
      links = detail.links;
    } catch (err) {
      return failed(root, me, err);
    }
  }
  const isNew = !appId;

  const field = (f: Field): Raw => {
    const value = (app[f.key] as string | undefined) ?? "";
    const input = f.type === "textarea"
      ? html`<textarea name="${f.key}" placeholder="${f.placeholder ?? ""}">${value}</textarea>`
      : html`<input type="${f.type}" name="${f.key}" value="${value}" placeholder="${f.placeholder ?? ""}" ${f.required ? "required" : ""} />`;
    return html`<div class="field"><label for="f-${f.key}">${f.label}${f.required ? "" : html` <span class="faint tiny">optional</span>`}</label>${input}${f.hint ? html`<div class="hint">${f.hint}</div>` : ""}</div>`;
  };

  mountShell(
    root,
    me,
    isNew ? "New app" : app.name ?? "App",
    html`
      ${!isNew ? html`<div id="release-card">${releaseCardSkeleton()}</div>` : ""}
      <form id="app-form" class="card mt">
        ${SECTIONS.map((s) => html`<div class="form-section"><div class="about"><h3>${s.title}</h3><p>${s.about}</p></div><div>${s.fields.map(field)}</div></div>`)}
        <div class="form-section">
          <div class="about"><h3>Screenshots</h3><p>Up to 10 image URLs, one per line. Leave blank to use the list from my-app.json or generated previews.</p></div>
          <div>
            <div class="field"><textarea name="screenshots" placeholder="https://...">${(app.screenshots ?? []).join("\n")}</textarea></div>
            <div class="shot-previews" id="shot-previews">${(app.screenshots ?? []).map((s) => html`<img src="${s}" alt="" />`)}</div>
          </div>
        </div>
        <div class="form-section">
          <div class="about"><h3>Visibility</h3><p>Your public page at /${me.developer.slug} lists apps you switch on, details only, no install links. Share links work either way.</p></div>
          <label class="check"><input type="checkbox" name="showOnPage" ${app.showOnPage ? "checked" : ""} /> <span>Show on my public page</span></label>
        </div>
        <div id="error"></div>
        <div class="sticky-save form-actions">
          <button class="btn" type="submit">${isNew ? "Create app" : "Save changes"}</button>
          ${!isNew ? html`<a class="btn secondary" href="/dev/apps/${appId}/preview">${icon("eye")} Preview install page</a><a class="btn secondary" href="/dev/apps/${appId}/links">${icon("link")} Share links (${links.length})</a><span class="grow"></span><button class="btn ghost" type="button" id="rotate">${icon("refresh")} New build token</button><button class="btn danger" type="button" id="delete">${icon("trash")} Delete</button>` : ""}
        </div>
      </form>
      <div id="token"></div>
    `,
    {
      crumbs: html`<a href="/dev/apps">Apps</a> / ${isNew ? "New" : app.name}`,
      sub: isNew ? "Two minutes now, a finished store page straight away." : app.repo,
    },
  );

  const form = root.querySelector<HTMLFormElement>("#app-form")!;
  const shotsInput = form.elements.namedItem("screenshots") as HTMLTextAreaElement;
  shotsInput.addEventListener("input", () => {
    const urls = shotsInput.value.split("\n").map((s) => s.trim()).filter((s) => /^https:\/\//.test(s));
    root.querySelector("#shot-previews")!.innerHTML = urls.map((u) => `<img src="${u.replace(/"/g, "")}" alt="" />`).join("");
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const s of SECTIONS) for (const f of s.fields) body[f.key] = String(fd.get(f.key) ?? "");
    body.screenshots = String(fd.get("screenshots") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    body.showOnPage = fd.get("showOnPage") === "on";
    try {
      if (appId) {
        await api("PUT", `/api/dev/apps/${appId}`, body);
        toast("Saved");
        navigate(`/dev/apps/${appId}`);
      } else {
        const res = await api<{ app: DevApp; buildToken: string }>("POST", "/api/dev/apps", body);
        sessionStorage.setItem(`buildToken:${res.app.id}`, res.buildToken);
        navigate(`/dev/apps/${res.app.id}`);
      }
    } catch (err) {
      showError(root, err);
      root.querySelector("#error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  root.querySelector<HTMLButtonElement>("#rotate")?.addEventListener("click", async () => {
    if (!(await confirmAction("The old token stops working at once. Continue?"))) return;
    const res = await api<{ buildToken: string }>("POST", `/api/dev/apps/${appId}/build-token`);
    showToken(root, appId!, res.buildToken);
  });
  root.querySelector<HTMLButtonElement>("#delete")?.addEventListener("click", async () => {
    if (!(await confirmAction(`Delete ${app.name}, its links and its device records? Friends who already installed keep the app.`))) return;
    await api("DELETE", `/api/dev/apps/${appId}`);
    navigate("/dev/apps");
  });

  if (appId) {
    const fresh = sessionStorage.getItem(`buildToken:${appId}`);
    if (fresh) {
      sessionStorage.removeItem(`buildToken:${appId}`);
      showToken(root, appId, fresh);
    }
    void loadReleaseCard(root, appId, app as DevApp);
  }
}

function releaseCardSkeleton(): Raw {
  return html`<div class="card"><div class="row"><div class="skeleton" style="width:120px;height:20px"></div><div class="grow"></div><div class="skeleton" style="width:80px;height:20px"></div></div><div class="skeleton mt" style="height:14px;width:60%"></div></div>`;
}

async function loadReleaseCard(root: HTMLElement, appId: string, app: DevApp): Promise<void> {
  const box = root.querySelector<HTMLElement>("#release-card");
  if (!box) return;
  try {
    release = await api<ReleaseStatus>("GET", `/api/dev/apps/${appId}/release`);
  } catch (err) {
    box.innerHTML = errorBox(err).html;
    return;
  }
  const r = release;
  const platforms = r.install ? [r.install.ios ? "iPhone" : "", r.install.android ? "Android" : "", r.install.pwa ? "Web" : ""].filter(Boolean).join(", ") : "";
  box.innerHTML = html`
    <div class="card">
      <div class="row wrap">
        <h2 class="grow">Latest release</h2>
        ${r.ok ? pill(`v${r.version}`, "ok", true) : pill("not readable", "bad", true)}
        <button class="btn sm secondary" id="recheck">${icon("refresh")} Check again</button>
      </div>
      ${r.ok
        ? html`
          <dl class="kv mt-s">
            <dt>Release</dt><dd>${r.tag ?? "direct URL"}${r.publishedAt ? html` <span class="faint">published ${fmtDate(r.publishedAt)}</span>` : ""}</dd>
            <dt>Platforms</dt><dd>${platforms || "none"}</dd>
            <dt>Assets</dt><dd>${r.assets.length > 0 ? r.assets.join(", ") : "n/a"}</dd>
            <dt>Screenshots in manifest</dt><dd>${r.screenshots}</dd>
            <dt>Release notes</dt><dd>${r.changelog ? "CHANGELOG.md shipped" : "no CHANGELOG.md in this release"}</dd>
            ${r.install?.ios ? html`<dt>Ad Hoc profile</dt><dd>${r.profile ? html`${r.profile.devices} device${r.profile.devices === 1 ? "" : "s"}, expires ${fmtDate(r.profile.expirationDate)}` : "not created yet; it is created when you approve the first iPhone"}</dd>` : ""}
          </dl>
          ${!r.changelog ? callout("warn", html`<p>No <code>CHANGELOG.md</code> in the latest release, so friends see release bodies or commit messages as the revision history. <a href="/dev/guide#release-notes">Add release notes</a>.</p>`) : ""}
          ${r.install?.ios && !r.appleKey ? callout("warn", html`<p>This app has an iPhone build but no App Store Connect key is saved. <a href="/dev/settings#credentials">Add it in Settings</a> before approving devices.</p>`) : ""}
          ${r.install?.ios && !app.profileName ? callout("warn", html`<p>Set the Ad Hoc provisioning profile name below so the console can recreate it when a device is added.</p>`) : ""}
        `
        : html`
          ${callout("bad", html`<b>The console cannot read a release for ${app.repo}.</b>${r.errors.map((e) => html`<p>${e}</p>`)}`)}
          <div class="mt small muted">
            Fix in this order:
            <ol class="bullets">
              ${!r.githubToken ? html`<li>Save a GitHub token in <a href="/dev/settings#credentials">Settings</a> (private repositories are invisible without one).</li>` : ""}
              <li>Publish a GitHub Release (not a draft, not a pre-release) with an asset named <code>my-app.json</code>.</li>
              <li>Make sure my-app.json follows schema 1; the error above names the field when it does not.</li>
              <li>Let a coding agent do it: copy the prompt from <a href="/dev/agents">Agents and API</a>.</li>
            </ol>
          </div>
        `}
    </div>
  `.html;
  root.querySelector<HTMLButtonElement>("#recheck")!.onclick = () => {
    box.innerHTML = releaseCardSkeleton().html;
    void loadReleaseCard(root, appId, app);
  };
}
let release: ReleaseStatus | null = null;

function showToken(root: HTMLElement, appId: string, token: string): void {
  const box = root.querySelector<HTMLElement>("#token")!;
  box.innerHTML = html`
    <div class="card once mt">
      <h2>${icon("lock", "icon-20")} Build token, shown once</h2>
      <p>Copy it now; the console keeps only a hash. If you lose it, make a new one with "New build token".</p>
      <div class="field"><span class="label">STORE_BUILD_TOKEN</span>${copyRow(token)}</div>
      <div class="field"><span class="label">STORE_APP_ID</span>${copyRow(appId)}<div class="hint">The opaque id of this app. The console sends it as <code>app</code> in every rebuild request and the workflow echoes it in <code>/api/build-ready</code> and the profile route.</div></div>
      <p><b>Add both as Actions secrets on the app's GitHub repository.</b> Either route works:</p>
      <ol class="steps small">
        <li>On GitHub: open the repository, then <b>Settings</b>, <b>Secrets and variables</b>, <b>Actions</b>, <b>Repository secrets</b>, <b>New repository secret</b>. Create <code>STORE_BUILD_TOKEN</code> and <code>STORE_APP_ID</code>.</li>
        <li>In a terminal inside a checkout of the repository: ${copyRow(`gh secret set STORE_BUILD_TOKEN --body "${token}" && gh secret set STORE_APP_ID --body "${appId}"`, "Copy command")}</li>
      </ol>
      <p class="small muted">Then make the repository follow the <a href="/contract.md">contract</a>, or hand that to an agent with the prompt on <a href="/dev/agents">Agents and API</a>.</p>
    </div>
  `.html;
  wireCopy(box);
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------------ */
/* Share links                                                         */
/* ------------------------------------------------------------------ */

export async function appLinks(root: HTMLElement, appId: string): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  let app: DevApp;
  let links: ShareLink[];
  try {
    ({ app, links } = await api<{ app: DevApp; links: ShareLink[] }>("GET", `/api/dev/apps/${appId}`));
  } catch (err) {
    return failed(root, me, err);
  }
  const now = Date.now();
  const state = (l: ShareLink) => (l.revokedAt ? "revoked" : l.expiresAt && Date.parse(l.expiresAt) < now ? "expired" : "active");
  const url = (l: ShareLink) => `${location.origin}/l/${l.id}`;

  mountShell(
    root,
    me,
    `Share links`,
    html`
      <div class="grid-2">
        <form id="link-form" class="card">
          <h2>New link</h2>
          <p class="small muted">Make one per person or group. A label tells you later who has it, and you can revoke one without affecting the others.</p>
          <div class="field"><label>Label</label><input type="text" name="label" maxlength="80" placeholder="Mum and Dad" /></div>
          <div class="field"><label>Expires <span class="faint tiny">optional</span></label><input type="datetime-local" name="expiresAt" /><div class="hint">After this moment the link shows "no longer active". Friends who already installed keep the app.</div></div>
          <div id="error"></div>
          <button class="btn" type="submit">${icon("plus")} Create link</button>
        </form>
        <div class="card">
          <h2>How to send it</h2>
          <ol class="steps small">
            <li><b>Messages or WhatsApp:</b> tap Share on a link below and pick the person. On iPhone the link opens in Safari's own view, where installs work.</li>
            <li><b>In person:</b> show the QR code; the camera app opens it.</li>
            <li><b>Email:</b> paste the link. Gmail's built-in browser cannot install, but the page tells the friend to open it in Safari or Chrome.</li>
          </ol>
          <p class="small muted">Instagram, Facebook and TikTok messages open pages inside their own browsers, which cannot install apps. The page explains the one extra tap.</p>
        </div>
      </div>
      <div class="section-title"><h2>${links.length === 0 ? "No links yet" : `${links.length} link${links.length === 1 ? "" : "s"}`}</h2></div>
      <div class="stack">
        ${links.map((l) => {
          const s = state(l);
          return html`
            <div class="link-card" data-link="${l.id}">
              <div>
                <div class="row wrap"><b style="font-size:16px">${l.label || "Untitled link"}</b>${statePill(s)}</div>
                <div class="small muted" style="margin:4px 0 10px">Created ${fmtDate(l.createdAt)}${l.expiresAt ? `, expires ${fmtDate(l.expiresAt, true)}` : ""}${l.revokedAt ? `, revoked ${fmtDate(l.revokedAt, true)}` : ""}</div>
                ${copyRow(url(l))}
                <div class="row wrap mt-s">
                  ${s === "active" ? html`<button class="btn sm" data-share="${l.id}">${icon("share")} Share</button><a class="btn sm secondary" href="${url(l)}" target="_blank" rel="noopener">${icon("eye")} Open</a><a class="btn sm secondary" href="/api/public/links/${l.id}/qr.svg" download="${(app.name || "app").replace(/\s+/g, "-")}-qr.svg">${icon("qr")} QR file</a><button class="btn sm ghost" data-revoke="${l.id}">Revoke</button>` : ""}
                  <button class="btn sm danger" data-delete="${l.id}">${icon("trash")} Delete</button>
                </div>
              </div>
              ${s === "active" ? html`<div class="qr">${qrSvg(url(l))}</div>` : ""}
            </div>`;
        })}
      </div>
    `,
    { crumbs: html`<a href="/dev/apps">Apps</a> / <a href="/dev/apps/${appId}">${app.name}</a> / Share links`, sub: `${app.name}. Links open the install page at /l/<id>; the id is random and never lists anywhere.` },
  );

  const form = root.querySelector<HTMLFormElement>("#link-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const expires = String(fd.get("expiresAt") ?? "");
    try {
      await api("POST", `/api/dev/apps/${appId}/links`, { label: String(fd.get("label") ?? ""), expiresAt: expires ? new Date(expires).toISOString() : null });
      toast("Link created");
      await appLinks(root, appId);
    } catch (err) {
      showError(root, err);
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-share]").forEach((b) => (b.onclick = async () => {
    const result = await shareOrCopy(`${location.origin}/l/${b.dataset.share}`, app.name);
    if (result === "copied") toast("Link copied");
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAction("Revoke this link? Anyone opening it sees \"no longer active\"."))) return;
    await api("POST", `/api/dev/links/${b.dataset.revoke}/revoke`);
    await appLinks(root, appId);
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAction("Delete this link for good?"))) return;
    await api("DELETE", `/api/dev/links/${b.dataset.delete}`);
    await appLinks(root, appId);
  }));
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

const STATE_HELP: Record<string, string> = {
  "awaiting-device": "The friend tapped Register but has not installed the profile yet. Nothing to do; it will move on by itself or you can remove it.",
  "pending-approval": "The iPhone reported its device number. Approve to register it with Apple and start a build, or reject.",
  registering: "Talking to Apple.",
  building: "Apple accepted the device. The repository was asked to rebuild; the friend's page flips to Install when the workflow calls build-ready.",
  ready: "Installed or ready to install. The friend's page shows the Install button.",
  rejected: "You declined this device.",
  failed: "Apple or GitHub refused; the message says why. Fix the cause and approve again.",
};

export async function devices(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  try {
    const [{ enrolments }, { apps }] = await Promise.all([api<{ enrolments: Enrolment[] }>("GET", "/api/dev/devices"), api<{ apps: DevApp[] }>("GET", "/api/dev/apps")]);
    const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "deleted app";
    const groups: [string, string, Enrolment[]][] = [
      ["Waiting for you", "pending-approval", enrolments.filter((e) => e.state === "pending-approval" || e.state === "failed")],
      ["In progress", "building", enrolments.filter((e) => ["awaiting-device", "registering", "building"].includes(e.state))],
      ["Done", "ready", enrolments.filter((e) => ["ready", "rejected"].includes(e.state))],
    ];
    mountShell(
      root,
      me,
      "Devices",
      html`
        ${callout("info", html`<p><b>How approval works.</b> Approving sends the iPhone to Apple, recreates the Ad Hoc profile with every registered device, and asks the app's repository to rebuild. Apple allows 100 iPhones per membership year and does not give a slot back when you remove a device, so approve people, not tests.</p>`)}
        ${!me.secrets.apple ? callout("warn", html`<p>No App Store Connect key is saved, so approvals will fail. <a href="/dev/settings#credentials">Add it in Settings</a>.</p>`) : ""}
        ${enrolments.length === 0 ? html`<div class="card mt">${emptyState("devices", "No devices yet", "When a friend taps Register on an install page, their iPhone appears here.")}</div>` : ""}
        ${groups.filter(([, , list]) => list.length > 0).map(([title, , list]) => html`
          <div class="section-title"><h2>${title}</h2><span class="muted small">${list.length}</span></div>
          <div class="stack">${list.map((e) => html`
            <div class="device-card">
              <div class="head"><b>${e.name}</b>${statePill(e.state)}<span class="muted small">${appName(e.appId)}${e.product ? ` · ${e.product}` : ""} · ${fmtDate(e.createdAt, true)}</span></div>
              <p class="small muted" style="margin:6px 0">${STATE_HELP[e.state] ?? ""}${e.message ? html` <span class="faint">(${e.message})</span>` : ""}</p>
              ${e.udid ? html`<div class="tiny faint">UDID <code>${e.udid}</code>${e.profileUuid ? html` · profile <code>${e.profileUuid}</code>` : ""}</div>` : ""}
              <div class="row wrap mt-s">
                ${["pending-approval", "failed"].includes(e.state) ? html`<button class="btn sm ok" data-approve="${e.id}">${icon("check")} Approve</button>` : ""}
                ${["awaiting-device", "pending-approval"].includes(e.state) ? html`<button class="btn sm secondary" data-reject="${e.id}">Reject</button>` : ""}
                <button class="btn sm ghost" data-remove="${e.id}">Remove record</button>
              </div>
            </div>`)}</div>
        `)}
        <div id="error" class="mt"></div>
      `,
      { sub: "Every iPhone that registered through one of your links." },
    );
    const act = async (b: HTMLButtonElement, fn: () => Promise<unknown>, busy: string) => {
      b.disabled = true;
      const label = b.innerHTML;
      b.textContent = busy;
      try {
        await fn();
        await devices(root);
      } catch (err) {
        b.disabled = false;
        b.innerHTML = label;
        showError(root, err);
        root.querySelector("#error")?.scrollIntoView({ behavior: "smooth" });
      }
    };
    root.querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((b) => (b.onclick = () => act(b, () => api("POST", `/api/dev/devices/${b.dataset.approve}/approve`), "Talking to Apple...")));
    root.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((b) => (b.onclick = () => act(b, () => api("POST", `/api/dev/devices/${b.dataset.reject}/reject`), "Rejecting")));
    root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => (b.onclick = async () => (await confirmAction("Remove this record? The Apple device slot stays used.")) && act(b, () => api("DELETE", `/api/dev/devices/${b.dataset.remove}`), "Removing")));
  } catch (err) {
    failed(root, me, err);
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function savedMarker(present: boolean, savedAt: string | null, group: string): Raw {
  if (!present) return pill("not saved", "warn");
  return html`${pill(`saved${savedAt ? " " + fmtDate(savedAt, true) : ""}`, "ok", true)} <button type="button" class="btn sm ghost" data-remove-secret="${group}">Remove</button>`;
}

const SECRET_GROUPS: Record<string, string[]> = {
  apple: ["appleIssuerId", "appleKeyId", "applePrivateKey"],
  appleTeamId: ["appleTeamId"],
  githubToken: ["githubToken"],
};

const EVENT_LABELS: Record<string, string> = {
  "sign-in": "Signed in",
  "sign-out": "Signed out",
  "sign-out-everywhere": "Signed out everywhere",
  "credentials-saved": "Credentials saved",
  "credentials-removed": "Credentials removed",
  "api-key-created": "API key created",
  "api-key-revoked": "API key revoked",
  "api-keys-revoked-all": "All API keys revoked",
  "build-token-rotated": "Build token rotated",
  "device-approved": "Device approved",
  "device-rejected": "Device rejected",
  "app-deleted": "App deleted",
};

export async function settings(root: HTMLElement, note = ""): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  const { events } = await api<{ events: AuditEvent[] }>("GET", "/api/dev/audit").catch(() => ({ events: [] as AuditEvent[] }));
  mountShell(
    root,
    me,
    "Settings",
    html`
      <div class="grid-2">
        <form id="me-form" class="card">
          <h2>Profile</h2>
          <div class="field"><label>Display name</label><input type="text" name="displayName" value="${me.developer.displayName}" required maxlength="80" /><div class="hint">Shown to friends on every install page.</div></div>
          <div class="field"><label>Public page address</label><input type="text" name="slug" value="${me.developer.slug}" required maxlength="40" /><div class="hint">${location.origin}/${me.developer.slug}</div></div>
          <div id="error"></div>
          <button class="btn" type="submit">Save profile</button>
        </form>
        <div class="card">
          <h2>Account</h2>
          <dl class="kv">
            <dt>GitHub</dt><dd>@${me.developer.githubLogin}</dd>
            <dt>Member since</dt><dd>${fmtDate(me.developer.createdAt)}</dd>
            <dt>Public page</dt><dd><a href="/${me.developer.slug}">/${me.developer.slug}</a></dd>
            <dt>Terms</dt><dd>${me.developer.termsAcceptedVersion ? html`Version ${me.developer.termsAcceptedVersion}, accepted ${fmtDate(me.developer.termsAcceptedAt, true)}` : "not accepted"} · <a href="/terms">Read the terms and data statement</a></dd>
          </dl>
          <p class="small muted mt">Sign-in only reads your public GitHub profile. Repository access comes from the token you save below, which you control and can revoke on GitHub at any time.</p>
          <hr />
          <h3>Delete account</h3>
          <p class="small muted">Removes your profile, credentials, API keys, apps, share links, device records and signing profiles at once. Installed apps keep working until their profile expires. Device registrations stay on your Apple account.</p>
          <div class="row wrap"><input type="text" id="confirm-login" placeholder="Type ${me.developer.githubLogin} to confirm" style="flex:1;min-width:200px" /><button class="btn danger" id="delete-account" disabled>${icon("trash")} Delete my account</button></div>
          <div id="delete-error" class="mt-s"></div>
        </div>
      </div>

      <form id="secrets-form" class="card mt" >
        <a id="credentials"></a>
        <h2>Credentials</h2>
        <p class="small muted">Stored encrypted with a key derived for your account and never shown again. Leave a field blank to keep what is saved.</p>
        ${note ? callout("ok", html`<p>${note}</p>`) : ""}

        <div class="form-section">
          <div class="about"><h3>GitHub token</h3><p>Lets the console read release assets from private repositories and send rebuild requests. <a href="/dev/guide#github-token">How to create one</a>.</p></div>
          <div>
            <div class="row wrap mb">${savedMarker(me.secrets.github, me.secrets.githubSavedAt, "githubToken")}</div>
            <div class="field"><label>Fine-grained token</label><input type="text" name="githubToken" autocomplete="off" placeholder="${me.secrets.github ? "saved; paste a new one to replace" : "github_pat_..."}" /><div class="hint">Permissions: Contents, read and write, on the app repositories only.</div></div>
          </div>
        </div>

        <div class="form-section">
          <div class="about"><h3>App Store Connect API key</h3><p>Registers friends' iPhones and recreates the Ad Hoc profile. Needs the Admin role. <a href="/dev/guide#apple-key">How to create one</a>.</p></div>
          <div>
            <div class="row wrap mb">${savedMarker(me.secrets.apple, me.secrets.appleSavedAt, "apple")}</div>
            <div class="field"><label>Issuer ID</label><input type="text" name="appleIssuerId" autocomplete="off" placeholder="${me.secrets.apple ? "saved" : "57246542-96fe-1a63-e053-0824d011072a"}" /></div>
            <div class="field"><label>Key ID</label><input type="text" name="appleKeyId" autocomplete="off" placeholder="${me.secrets.apple ? "saved" : "2X9R4HXF34"}" /></div>
            <div class="field"><label>Private key (.p8 contents)</label><textarea name="applePrivateKey" autocomplete="off" placeholder="${me.secrets.apple ? "saved" : "-----BEGIN PRIVATE KEY-----"}"></textarea></div>
          </div>
        </div>

        <div class="form-section">
          <div class="about"><h3>Apple team ID</h3><p>Ten characters, shown under Membership details on developer.apple.com.</p></div>
          <div>
            <div class="row wrap mb">${savedMarker(Boolean(me.secrets.appleTeamId), me.secrets.appleTeamIdSavedAt, "appleTeamId")}</div>
            <div class="field"><input type="text" name="appleTeamId" value="${me.secrets.appleTeamId}" autocomplete="off" placeholder="ABCDE12345" /></div>
          </div>
        </div>
        <div id="secrets-error"></div>
        <div class="form-actions"><button class="btn" type="submit">Save credentials</button></div>
      </form>

      <div class="card mt">
        <a id="security"></a>
        <div class="row wrap"><h2 class="grow">Security</h2><button class="btn sm danger" id="logout-all">Sign out everywhere</button></div>
        <p class="small muted">How your credentials are kept: each field is encrypted on its own with AES-256-GCM under a key derived for your account alone; the master secret lives only in the server's secret store, never in the database or in code. API keys, build tokens and sessions are stored as keyed hashes, so a copy of the database cannot be used to sign in. Credentials can only be changed from this page with a fresh browser session, never with an API key.</p>
        <h3 class="mt">Recent activity</h3>
        ${events.length === 0 ? html`<p class="small muted">Nothing recorded yet.</p>` : html`<table class="table small mt-s">${events.slice(0, 25).map((e) => html`<tr><td style="white-space:nowrap">${fmtDate(e.createdAt, true)}</td><td><b>${EVENT_LABELS[e.event] ?? e.event}</b>${e.detail ? html` <span class="muted">${e.detail}</span>` : ""}</td><td class="faint">${e.country ?? ""}</td></tr>`)}</table>`}
        <p class="tiny faint mt-s">Anything here you do not recognise: sign out everywhere, revoke your API keys on the Agents page, and replace the GitHub token and Apple key at their sources.</p>
      </div>
    `,
    { sub: "Who you are to your friends, and the keys the console uses on your behalf." },
  );
  const confirmInput = root.querySelector<HTMLInputElement>("#confirm-login")!;
  const deleteBtn = root.querySelector<HTMLButtonElement>("#delete-account")!;
  confirmInput.oninput = () => (deleteBtn.disabled = confirmInput.value.trim() !== me.developer.githubLogin);
  deleteBtn.onclick = async () => {
    if (!(await confirmAction("Delete your account and everything in it? This cannot be undone."))) return;
    try {
      await api("DELETE", "/api/dev/me", { confirm: confirmInput.value.trim() });
      location.href = "/";
    } catch (err) {
      showError(root, err, "#delete-error");
    }
  };
  root.querySelector<HTMLButtonElement>("#logout-all")!.onclick = async () => {
    if (!(await confirmAction("Sign out of every browser, including this one? API keys stay valid; revoke them on the Agents page if needed."))) return;
    await api("POST", "/api/auth/logout-everywhere");
    location.href = "/";
  };
  if (location.hash === "#credentials" || location.hash === "#security") root.querySelector(location.hash)?.scrollIntoView();

  const meForm = root.querySelector<HTMLFormElement>("#me-form")!;
  meForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(meForm);
    try {
      await api("PUT", "/api/dev/me", { displayName: fd.get("displayName"), slug: fd.get("slug") });
      toast("Profile saved");
      await settings(root);
    } catch (err) {
      showError(root, err);
    }
  };
  const secretsForm = root.querySelector<HTMLFormElement>("#secrets-form")!;
  secretsForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(secretsForm);
    const body: Record<string, unknown> = {};
    for (const k of ["appleIssuerId", "appleKeyId", "applePrivateKey", "appleTeamId", "githubToken"]) body[k] = fd.get(k);
    const changed = Object.values(body).filter((v) => String(v ?? "").trim() !== "").length;
    try {
      await api("PUT", "/api/dev/secrets", body);
      await settings(root, changed > 0 ? "Credentials saved." : "Nothing to save; all fields were blank.");
    } catch (err) {
      showError(root, err, "#secrets-error");
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-remove-secret]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAction("Remove this credential? Approvals and release reads that need it stop working."))) return;
    const body: Record<string, string> = {};
    for (const k of SECRET_GROUPS[b.dataset.removeSecret!]) body[k] = "-";
    await api("PUT", "/api/dev/secrets", body);
    await settings(root, "Credential removed.");
  }));
}

/* ------------------------------------------------------------------ */
/* Agents and API                                                      */
/* ------------------------------------------------------------------ */

export async function agents(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  let keys: ApiKey[] = [];
  let apps: DevApp[] = [];
  try {
    [{ keys }, { apps }] = await Promise.all([api<{ keys: ApiKey[] }>("GET", "/api/dev/keys"), api<{ apps: DevApp[] }>("GET", "/api/dev/apps")]);
  } catch (err) {
    return failed(root, me, err);
  }
  const first = apps[0];
  const repoPrompt = AGENT_REPO_PROMPT({ repo: first?.repo || "<owner>/<name>", appId: first?.id || "<STORE_APP_ID>", profileName: first?.profileName || "<profile name>", name: first?.name || "<app name>" });
  const storePrompt = AGENT_STORE_PROMPT();

  mountShell(
    root,
    me,
    "Agents and API",
    html`
      ${callout("info", html`<p><b>Everything the console does is an API, and the prompts below explain it all to an agent.</b> What stays with you: signing in, creating the GitHub token and the Apple key, the Apple portal setup for iPhone apps, creating an API key here, approving iPhones by name, and sending links to people. The <a href="/dev/guide#tldr">TL;DR in the guide</a> lists exactly those. Full reference: <a href="/agents.md">ourapps.app/agents.md</a>; repository contract: <a href="/contract.md">ourapps.app/contract.md</a>.</p>`)}

      <div class="grid-2 mt">
        <div class="card">
          <h2>API keys</h2>
          <p class="small muted">A key acts as you within its scope. It can never create or revoke keys or change credentials. Make one per agent or machine so you can revoke them one at a time.</p>
          <form id="key-form" class="mt">
            <div class="field"><label>Name</label><input type="text" name="name" placeholder="laptop agent" maxlength="60" /></div>
            <div class="row wrap">
              <div class="field grow"><label>Scope</label><select name="scope"><option value="manage">Manage: create apps, links, approve devices</option><option value="read">Read only: list and check</option></select></div>
              <div class="field grow"><label>Expires</label><select name="expiresInDays"><option value="30">30 days</option><option value="90" selected>90 days</option><option value="365">1 year</option><option value="">Never</option></select></div>
            </div>
            <button class="btn" type="submit">${icon("plus")} Create key</button>
          </form>
          <div id="error"></div>
          <div id="new-key"></div>
          <div class="mt" id="key-list">${keyList(keys)}</div>
          ${keys.length > 1 ? html`<button class="btn sm ghost mt" id="revoke-all">Revoke all keys</button>` : ""}
        </div>
        <div class="card">
          <h2>Quick reference</h2>
          <p class="small muted">Base URL <code>${location.origin}</code>. Header <code>Authorization: Bearer oa_...</code>. JSON in, JSON out, errors as <code>{"error": "..."}</code>.</p>
          <table class="table small mt-s">
            <tr><td><code>GET /api/dev/me</code></td><td>who the key belongs to</td></tr>
            <tr><td><code>GET, POST /api/dev/apps</code></td><td>list, create (returns the build token once)</td></tr>
            <tr><td><code>GET, PUT, DELETE /api/dev/apps/:id</code></td><td>read with links, update, delete</td></tr>
            <tr><td><code>GET /api/dev/apps/:id/release</code></td><td>what the latest release looks like and why it fails</td></tr>
            <tr><td><code>POST /api/dev/apps/:id/links</code></td><td>new share link</td></tr>
            <tr><td><code>GET /api/public/links/:id/qr.svg</code></td><td>QR for a link</td></tr>
            <tr><td><code>GET /api/dev/devices</code></td><td>iPhones and their states</td></tr>
            <tr><td><code>POST /api/dev/devices/:id/approve</code></td><td>register with Apple and rebuild</td></tr>
          </table>
          <pre class="mt-s"><code>curl -H "Authorization: Bearer $OURAPPS_API_KEY" \\
  ${location.origin}/api/dev/apps</code></pre>
        </div>
      </div>

      <div class="section-title"><h2>Prompts for your agents</h2></div>
      <p class="muted small">Copy, fill in the angle brackets if any remain, and paste into your coding agent. The first one works inside the app repository; the second one drives this console through the API.</p>
      <div class="card">
        <h3>1. Set up the app repository ${first ? html`<span class="faint small">(filled in for ${first.name})</span>` : ""}</h3>
        <p class="small muted">Give this to an agent running inside the repository (Claude Code, Codex, Cursor, opencode). It creates the release workflow, my-app.json and the rebuild hook the contract asks for.</p>
        <div class="prompt-box"><button class="btn sm secondary" data-copy="${repoPrompt}">${icon("copy")} Copy</button><pre>${repoPrompt}</pre></div>
      </div>
      <div class="card">
        <h3>2. Manage the console through the API</h3>
        <p class="small muted">Give this to an agent that has your API key in the environment variable <code>OURAPPS_API_KEY</code>. It can register apps, check releases, hand you share links and approve devices you confirm.</p>
        <div class="prompt-box"><button class="btn sm secondary" data-copy="${storePrompt}">${icon("copy")} Copy</button><pre>${storePrompt}</pre></div>
      </div>
    `,
    { sub: "Let a coding agent do the repository work and drive this console for you." },
  );

  const form = root.querySelector<HTMLFormElement>("#key-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const days = String(fd.get("expiresInDays") ?? "");
    try {
      const res = await api<{ key: string; apiKey: ApiKey }>("POST", "/api/dev/keys", { name: fd.get("name"), scope: fd.get("scope"), expiresInDays: days === "" ? null : Number(days) });
      const box = root.querySelector<HTMLElement>("#new-key")!;
      box.innerHTML = html`<div class="once mt"><b>${icon("lock", "icon-16")} Key for "${res.apiKey.name}", shown once</b>${copyRow(res.key)}<p class="small mt-s">Store it where the agent runs, for example <code>export OURAPPS_API_KEY=${res.key}</code>. It cannot be shown again.</p></div>`.html;
      wireCopy(box);
      form.reset();
      await refreshKeys(root);
    } catch (err) {
      showError(root, err);
    }
  };
  wireKeyButtons(root);
  root.querySelector<HTMLButtonElement>("#revoke-all")?.addEventListener("click", async () => {
    if (!(await confirmAction("Revoke every API key? Every agent using one stops working at once."))) return;
    await api("POST", "/api/dev/keys/revoke-all");
    toast("All keys revoked");
    await agents(root);
  });
}

function keyList(keys: ApiKey[]): Raw {
  if (keys.length === 0) return html`<p class="small muted">No keys yet.</p>`;
  return html`${keys.map((k) => html`
    <div class="key-row">
      <div>
        <b>${k.name}</b> <code>${k.prefix}...</code> ${pill(k.scope === "read" ? "read only" : "manage", k.scope === "read" ? "" : "accent")}
        <div class="tiny faint">Created ${fmtDate(k.createdAt)}${k.expiresAt ? `, expires ${fmtDate(k.expiresAt)}` : ", no expiry"}${k.lastUsedAt ? `, last used ${fmtDate(k.lastUsedAt, true)}` : ", never used"}</div>
      </div>
      <button class="btn sm danger" data-revoke-key="${k.id}">Revoke</button>
    </div>`)}`;
}

function wireKeyButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-revoke-key]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmAction("Revoke this key? Anything using it stops working at once."))) return;
    await api("DELETE", `/api/dev/keys/${b.dataset.revokeKey}`);
    toast("Key revoked");
    await agents(root);
  }));
}

async function refreshKeys(root: HTMLElement): Promise<void> {
  const { keys } = await api<{ keys: ApiKey[] }>("GET", "/api/dev/keys");
  const rows = root.querySelector<HTMLElement>("#key-list");
  if (!rows) return;
  rows.innerHTML = keyList(keys).html;
  wireKeyButtons(root);
}

export { raw, wireImages, copyText, ApiError };
