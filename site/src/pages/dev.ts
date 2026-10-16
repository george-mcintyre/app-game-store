import { ApiError, api, type DevApp, type Enrolment, type Me, type ShareLink } from "../api.js";
import { html, mount, raw, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { qrSvg, shareOrCopy } from "../qr.js";
import { layout } from "./public.js";

async function requireMe(root: HTMLElement): Promise<Me | null> {
  try {
    return await api<Me>("GET", "/api/dev/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      mount(root, layout(html`<div class="card"><h1>Developers</h1><p>Sign in to manage your apps and share links.</p><a class="button" href="/api/auth/github">Sign in with GitHub</a></div>`));
    } else {
      mount(root, layout(html`<div class="error">${String(err)}</div>`));
    }
    return null;
  }
}

function devNav(me: Me): Raw {
  return html`
    <div class="row wrap small" style="margin-bottom:8px">
      <a href="/dev">Apps</a>
      <a href="/dev/devices">Devices</a>
      <a href="/dev/settings">Settings</a>
      <a href="/${me.developer.slug}">My page</a>
      <span class="grow"></span>
      <span class="muted">${me.developer.displayName}</span>
      <form method="post" action="/api/auth/logout" style="display:inline"><button class="button secondary" style="padding:4px 12px;font-size:13px">Sign out</button></form>
    </div>
  `;
}

function showError(root: HTMLElement, err: unknown): void {
  const box = root.querySelector("#error");
  if (box) box.innerHTML = `<div class="error">${String(err instanceof Error ? err.message : err).replace(/</g, "&lt;")}</div>`;
}

export async function dashboard(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  const { apps } = await api<{ apps: DevApp[] }>("GET", "/api/dev/apps");
  const setup: Raw[] = [];
  if (!me.secrets.apple) setup.push(html`<li>Add your App Store Connect API key in <a href="/dev/settings">Settings</a> so iPhones can be registered.</li>`);
  if (!me.secrets.github) setup.push(html`<li>Add a GitHub token in <a href="/dev/settings">Settings</a> so the store can read releases and trigger rebuilds.</li>`);
  mount(
    root,
    layout(html`
      ${devNav(me)}
      <h1>Your apps</h1>
      ${setup.length > 0 ? html`<div class="notice"><b>Before sharing:</b><ul class="steps">${setup}</ul></div>` : ""}
      ${apps.map(
        (a) => html`
          <div class="card row">
            ${a.iconUrl || a.releaseIcon ? html`<img class="icon small" src="${a.iconUrl || a.releaseIcon}" alt="" />` : html`<div class="icon small"></div>`}
            <div class="grow">
              <b><a href="/dev/apps/${a.id}">${a.name}</a></b>
              <div class="muted small">${a.repo}${a.showOnPage ? " · on your page" : ""}</div>
            </div>
            <a class="button secondary" href="/dev/apps/${a.id}/links">Share links</a>
          </div>
        `,
      )}
      <a class="button" href="/dev/apps/new">Add an app</a>
    `),
  );
}

const FIELDS: { key: keyof DevApp; label: string; type: "text" | "url" | "textarea"; hint?: string }[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "tagline", label: "Tagline", type: "text", hint: "One line under the name." },
  { key: "repo", label: "GitHub repository (owner/name)", type: "text", hint: "The store reads my-app.json from the latest release and sends rebuild requests here." },
  { key: "profileName", label: "Ad Hoc provisioning profile name", type: "text", hint: "Create the profile once in the Apple developer portal; the store recreates it with each new device." },
  { key: "iconUrl", label: "Icon URL", type: "url", hint: "Square, at least 512 pixels. Leave blank to use the icon from my-app.json." },
  { key: "description", label: "Description", type: "textarea" },
  { key: "whatsNew", label: "What's new", type: "textarea" },
  { key: "size", label: "Size", type: "text", hint: "For example 24 MB." },
  { key: "minOs", label: "Compatibility", type: "text", hint: "For example iOS 17 or later, Android 10 or later." },
  { key: "ageNote", label: "Age note", type: "text", hint: "Optional, for example 12+." },
  { key: "privacySummary", label: "Privacy summary", type: "textarea", hint: "In your own words: what the app collects and where it goes." },
  { key: "manifestUrl", label: "my-app.json URL (optional)", type: "url", hint: "Only if the file is not a release asset on the repository above." },
];

export async function appForm(root: HTMLElement, appId: string | null): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  let app: Partial<DevApp> = { screenshots: [], showOnPage: false };
  if (appId) {
    try {
      app = (await api<{ app: DevApp }>("GET", `/api/dev/apps/${appId}`)).app;
    } catch (err) {
      return mount(root, layout(html`${devNav(me)}<div class="error">${String(err)}</div>`));
    }
  }
  mount(
    root,
    layout(html`
      ${devNav(me)}
      <h1>${appId ? app.name : "New app"}</h1>
      <form id="app-form" class="card">
        ${FIELDS.map((f) => {
          const value = (app[f.key] as string | undefined) ?? "";
          const input = f.type === "textarea" ? html`<textarea name="${f.key}">${value}</textarea>` : html`<input type="${f.type}" name="${f.key}" value="${value}" ${f.key === "name" || f.key === "repo" ? "required" : ""} />`;
          return html`<label>${f.label}</label>${input}${f.hint ? html`<div class="small muted">${f.hint}</div>` : ""}`;
        })}
        <label>Screenshot URLs, one per line (blank uses the list in my-app.json)</label>
        <textarea name="screenshots">${(app.screenshots ?? []).join("\n")}</textarea>
        <label class="check"><input type="checkbox" name="showOnPage" ${app.showOnPage ? "checked" : ""} /> Show on my public page (details only, no install)</label>
        <div id="error"></div>
        <div class="row wrap" style="margin-top:16px">
          <button class="button" type="submit">${appId ? "Save" : "Create"}</button>
          ${appId ? html`<a class="button secondary" href="/dev/apps/${appId}/links">Share links</a><button class="button secondary" type="button" id="rotate">New build token</button><button class="button danger" type="button" id="delete">Delete app</button>` : ""}
        </div>
      </form>
      <div id="token"></div>
    `),
  );
  const form = root.querySelector<HTMLFormElement>("#app-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const f of FIELDS) body[f.key] = String(fd.get(f.key) ?? "");
    body.screenshots = String(fd.get("screenshots") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    body.showOnPage = fd.get("showOnPage") === "on";
    try {
      if (appId) {
        await api("PUT", `/api/dev/apps/${appId}`, body);
        navigate("/dev");
      } else {
        const res = await api<{ app: DevApp; buildToken: string }>("POST", "/api/dev/apps", body);
        showToken(root, res.app.id, res.buildToken);
        appId = res.app.id;
        root.querySelector("h1")!.textContent = res.app.name;
      }
    } catch (err) {
      showError(root, err);
    }
  };
  root.querySelector<HTMLButtonElement>("#rotate")?.addEventListener("click", async () => {
    if (!confirm("The old token stops working at once. Continue?")) return;
    const res = await api<{ buildToken: string }>("POST", `/api/dev/apps/${appId}/build-token`);
    showToken(root, appId!, res.buildToken);
  });
  root.querySelector<HTMLButtonElement>("#delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this app, its links and its device records?")) return;
    await api("DELETE", `/api/dev/apps/${appId}`);
    navigate("/dev");
  });
}

function showToken(root: HTMLElement, appId: string, token: string): void {
  root.querySelector("#token")!.innerHTML = html`
    <div class="card">
      <h2>Build token (shown once)</h2>
      <p>Copy it now; the store keeps only a hash. If you lose it, make a new one with "New build token".</p>
      <p><code>STORE_BUILD_TOKEN</code> = <code>${token}</code></p>
      <p><code>STORE_APP_ID</code> = <code>${appId}</code></p>
      <p class="small">STORE_APP_ID is the opaque id of this app. The store sends it as "app" in every rebuild request and the workflow echoes it back in /api/build-ready and the profile route.</p>
      <p><b>Add both as Actions secrets on the app's GitHub repository.</b> Either route works:</p>
      <ol class="steps small">
        <li>On GitHub: open the repository, then <b>Settings</b>, <b>Secrets and variables</b>, <b>Actions</b>, <b>Repository secrets</b>, <b>New repository secret</b>. Create <code>STORE_BUILD_TOKEN</code> and <code>STORE_APP_ID</code>.</li>
        <li>In a terminal inside a checkout of the repository: <code>gh secret set STORE_BUILD_TOKEN</code> then <code>gh secret set STORE_APP_ID</code>, pasting each value when asked.</li>
      </ol>
      <p class="small muted">See CONTRACT.md in the store repository for the workflow the app needs.</p>
      <a class="button" href="/dev/apps/${appId}/links">Create a share link</a>
    </div>
  `.html;
}

export async function appLinks(root: HTMLElement, appId: string): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  const { app, links } = await api<{ app: DevApp; links: ShareLink[] }>("GET", `/api/dev/apps/${appId}`);
  const now = Date.now();
  const state = (l: ShareLink) => (l.revokedAt ? "revoked" : l.expiresAt && Date.parse(l.expiresAt) < now ? "expired" : "active");
  mount(
    root,
    layout(html`
      ${devNav(me)}
      <h1>${app.name}: share links</h1>
      <form id="link-form" class="card">
        <label>Label (who it is for)</label>
        <input type="text" name="label" maxlength="80" placeholder="Family group" />
        <label>Expires (optional)</label>
        <input type="datetime-local" name="expiresAt" />
        <div id="error"></div>
        <button class="button" type="submit" style="margin-top:12px">Create link</button>
      </form>
      ${links.map(
        (l) => html`
          <div class="card" data-link="${l.id}">
            <div class="row">
              <div class="grow">
                <b>${l.label || "Untitled"}</b> <span class="state ${state(l)}">${state(l)}</span>
                <div class="small"><code>${location.origin}/l/${l.id}</code></div>
                <div class="small muted">Created ${new Date(l.createdAt).toLocaleDateString()}${l.expiresAt ? `, expires ${new Date(l.expiresAt).toLocaleString()}` : ""}</div>
              </div>
            </div>
            ${state(l) === "active" ? html`<div class="qr" style="margin:12px 0">${qrSvg(`${location.origin}/l/${l.id}`)}</div>` : ""}
            <div class="row wrap">
              ${state(l) === "active" ? html`<button class="button secondary" data-share="${l.id}">Share</button><button class="button secondary" data-revoke="${l.id}">Revoke</button>` : ""}
              <button class="button danger" data-delete="${l.id}">Delete</button>
            </div>
          </div>
        `,
      )}
    `),
  );
  const form = root.querySelector<HTMLFormElement>("#link-form")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const expires = String(fd.get("expiresAt") ?? "");
    try {
      await api("POST", `/api/dev/apps/${appId}/links`, { label: String(fd.get("label") ?? ""), expiresAt: expires ? new Date(expires).toISOString() : null });
      await appLinks(root, appId);
    } catch (err) {
      showError(root, err);
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-share]").forEach((b) => (b.onclick = async () => {
    const result = await shareOrCopy(`${location.origin}/l/${b.dataset.share}`, app.name);
    b.textContent = result === "copied" ? "Copied" : result === "shared" ? "Shared" : "Could not share";
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach((b) => (b.onclick = async () => {
    await api("POST", `/api/dev/links/${b.dataset.revoke}/revoke`);
    await appLinks(root, appId);
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this link? Anyone holding it loses access.")) return;
    await api("DELETE", `/api/dev/links/${b.dataset.delete}`);
    await appLinks(root, appId);
  }));
}

export async function devices(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  const [{ enrolments }, { apps }] = await Promise.all([api<{ enrolments: Enrolment[] }>("GET", "/api/dev/devices"), api<{ apps: DevApp[] }>("GET", "/api/dev/apps")]);
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? id;
  mount(
    root,
    layout(html`
      ${devNav(me)}
      <h1>Devices</h1>
      <p class="muted small">Approving sends the iPhone to Apple, recreates the Ad Hoc profile and asks the app repository for a new build. Apple allows 100 iPhones per membership year; removing a record here does not free the slot.</p>
      <div id="error"></div>
      ${enrolments.length === 0 ? html`<p class="card">No devices yet. Share a link and ask a friend to register.</p>` : ""}
      ${enrolments.map(
        (e) => html`
          <div class="card">
            <div class="row">
              <div class="grow">
                <b>${e.name}</b> <span class="state ${e.state}">${e.state}</span>
                <div class="small muted">${appName(e.appId)}${e.product ? ` · ${e.product}` : ""} · ${new Date(e.createdAt).toLocaleString()}</div>
                ${e.udid ? html`<div class="small"><code>${e.udid}</code></div>` : ""}
                ${e.message ? html`<div class="small muted">${e.message}</div>` : ""}
              </div>
            </div>
            <div class="row wrap" style="margin-top:8px">
              ${["pending-approval", "failed"].includes(e.state) ? html`<button class="button" data-approve="${e.id}">Approve</button>` : ""}
              ${["awaiting-device", "pending-approval"].includes(e.state) ? html`<button class="button secondary" data-reject="${e.id}">Reject</button>` : ""}
              <button class="button danger" data-remove="${e.id}">Remove</button>
            </div>
          </div>
        `,
      )}
    `),
  );
  const act = async (b: HTMLButtonElement, fn: () => Promise<unknown>) => {
    b.disabled = true;
    try {
      await fn();
      await devices(root);
    } catch (err) {
      b.disabled = false;
      showError(root, err);
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-approve]").forEach((b) => (b.onclick = () => act(b, () => api("POST", `/api/dev/devices/${b.dataset.approve}/approve`))));
  root.querySelectorAll<HTMLButtonElement>("[data-reject]").forEach((b) => (b.onclick = () => act(b, () => api("POST", `/api/dev/devices/${b.dataset.reject}/reject`))));
  root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => (b.onclick = () => confirm("Remove this record?") && act(b, () => api("DELETE", `/api/dev/devices/${b.dataset.remove}`))));
}

export async function settings(root: HTMLElement): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  mount(
    root,
    layout(html`
      ${devNav(me)}
      <h1>Settings</h1>
      <form id="me-form" class="card">
        <h2>Your page</h2>
        <label>Display name</label>
        <input type="text" name="displayName" value="${me.developer.displayName}" required maxlength="80" />
        <label>Page address</label>
        <input type="text" name="slug" value="${me.developer.slug}" required maxlength="40" />
        <div class="small muted">${location.origin}/${me.developer.slug}</div>
        <div id="error"></div>
        <button class="button" type="submit" style="margin-top:12px">Save</button>
      </form>
      <form id="secrets-form" class="card">
        <h2>Credentials</h2>
        <p class="small muted">Stored encrypted. Leave a field blank to keep the current value; enter a single hyphen to clear it.</p>
        <p class="small">Apple key: <b>${me.secrets.apple ? "saved" : "missing"}</b>. GitHub token: <b>${me.secrets.github ? "saved" : "missing"}</b>.</p>
        <label>App Store Connect issuer id</label>
        <input type="text" name="appleIssuerId" autocomplete="off" />
        <label>App Store Connect key id</label>
        <input type="text" name="appleKeyId" autocomplete="off" />
        <label>App Store Connect private key (.p8 contents)</label>
        <textarea name="applePrivateKey" autocomplete="off"></textarea>
        <label>Apple team id</label>
        <input type="text" name="appleTeamId" value="${me.secrets.appleTeamId}" autocomplete="off" />
        <label>GitHub fine-grained token (Contents: read and write on your app repositories)</label>
        <input type="text" name="githubToken" autocomplete="off" />
        <div id="secrets-error"></div>
        <button class="button" type="submit" style="margin-top:12px">Save credentials</button>
      </form>
    `),
  );
  const meForm = root.querySelector<HTMLFormElement>("#me-form")!;
  meForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(meForm);
    try {
      await api("PUT", "/api/dev/me", { displayName: fd.get("displayName"), slug: fd.get("slug") });
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
    try {
      await api("PUT", "/api/dev/secrets", body);
      await settings(root);
    } catch (err) {
      root.querySelector("#secrets-error")!.innerHTML = raw(`<div class="error">${String(err instanceof Error ? err.message : err).replace(/</g, "&lt;")}</div>`).html;
    }
  };
}
