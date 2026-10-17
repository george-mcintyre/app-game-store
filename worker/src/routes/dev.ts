// Developer dashboard routes, all behind the session cookie.
import { audit } from "../audit.js";
import { RESERVED_SLUGS, apiKeyHash, masterKeys, newApiKey, normaliseSlug, requireSession, type AuthedDeveloper } from "../auth.js";
import { randomId, tokenHash, validateAppleKey } from "../crypto.js";
import { Db, type ApiKeyRow, type AppRow, type Developer, type DeveloperSecrets, type KeyScope, type LinkRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { approveEnrolment, dlUrl, transition } from "../flow.js";
import { HttpError, httpsUrlOrEmpty, json, readJson, text } from "../http.js";
import { SECRET_FIELDS, appleReady, loadSecrets, saveSecrets, secretsSummary } from "../secrets.js";
import { fetchManifest, loadManifest, resolveRelease } from "../upstream.js";
import { buildLinkPage } from "./public.js";

type AppInput = Partial<Record<"name" | "tagline" | "description" | "whatsNew" | "size" | "minOs" | "ageNote" | "privacySummary" | "iconUrl" | "repo" | "manifestUrl" | "profileName", string>> & {
  screenshots?: unknown;
  showOnPage?: unknown;
};

function buildTokenHash(env: Env, token: string): Promise<string> {
  return tokenHash(masterKeys(env), "build-token", token);
}

function publicApp(app: AppRow) {
  const { buildTokenHash: _hash, ...rest } = app;
  return rest;
}

function applyInput(app: AppRow, body: AppInput): void {
  if (body.name !== undefined) app.name = text(body.name, 80);
  if (app.name === "") throw new HttpError(400, "name is required");
  if (body.repo !== undefined) app.repo = text(body.repo, 120);
  if (!/^[\w.-]+\/[\w.-]+$/.test(app.repo)) throw new HttpError(400, "repo must be owner/name");
  if (body.tagline !== undefined) app.tagline = text(body.tagline, 120);
  if (body.description !== undefined) app.description = text(body.description, 4000);
  if (body.whatsNew !== undefined) app.whatsNew = text(body.whatsNew, 2000);
  if (body.size !== undefined) app.size = text(body.size, 40);
  if (body.minOs !== undefined) app.minOs = text(body.minOs, 80);
  if (body.ageNote !== undefined) app.ageNote = text(body.ageNote, 120);
  if (body.privacySummary !== undefined) app.privacySummary = text(body.privacySummary, 2000);
  if (body.iconUrl !== undefined) app.iconUrl = httpsUrlOrEmpty(body.iconUrl);
  if (body.manifestUrl !== undefined) app.manifestUrl = httpsUrlOrEmpty(body.manifestUrl);
  if (body.profileName !== undefined) app.profileName = text(body.profileName, 120);
  if (body.showOnPage !== undefined) app.showOnPage = body.showOnPage === true;
  if (body.screenshots !== undefined) {
    if (!Array.isArray(body.screenshots) || body.screenshots.length > 10) throw new HttpError(400, "screenshots must be a list of at most 10 https URLs");
    app.screenshots = body.screenshots.map((s) => httpsUrlOrEmpty(s)).filter((s) => s !== "");
  }
}

async function ownedApp(db: Db, dev: Developer, id: string): Promise<AppRow> {
  const app = await db.appById(id);
  if (!app || app.developerId !== dev.id) throw new HttpError(404, "unknown app");
  return app;
}

// What the dashboard may know about stored credentials: presence and save dates, never values.
function secretStatus(s: DeveloperSecrets) {
  const at = s.savedAt ?? {};
  const appleDates = [at.appleIssuerId, at.appleKeyId, at.applePrivateKey].filter((d): d is string => Boolean(d)).sort();
  return {
    apple: appleReady(s),
    appleSavedAt: appleReady(s) ? appleDates[appleDates.length - 1] ?? null : null,
    appleTeamId: s.appleTeamId ?? "",
    appleTeamIdSavedAt: s.appleTeamId ? at.appleTeamId ?? null : null,
    github: Boolean(s.githubToken),
    githubSavedAt: s.githubToken ? at.githubToken ?? null : null,
  };
}

// GET /api/dev/me
export async function me(env: Env, dev: AuthedDeveloper): Promise<Response> {
  const { authVia, scope, keyId: _k, ...developer } = dev;
  return json({ developer, authVia, scope, secrets: secretStatus(await secretsSummary(env, dev.id)) });
}

// PUT /api/dev/me
export async function updateMe(request: Request, env: Env, dev: Developer): Promise<Response> {
  const body = await readJson<{ slug?: string; displayName?: string }>(request);
  const slug = normaliseSlug(text(body.slug, 40));
  const displayName = text(body.displayName, 80);
  if (slug === "" || RESERVED_SLUGS.has(slug)) throw new HttpError(400, "that page name is not available");
  if (displayName === "") throw new HttpError(400, "display name is required");
  const db = Db.from(env);
  const taken = await db.developerBySlug(slug);
  if (taken && taken.id !== dev.id) throw new HttpError(409, "that page name is taken");
  await db.updateDeveloper(dev.id, slug, displayName);
  return json({ developer: { ...dev, slug, displayName } });
}

// PUT /api/dev/secrets - dashboard only. Blank fields keep their current value; "-" clears one.
export async function updateSecrets(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<Partial<DeveloperSecrets>>(request);
  const current = await loadSecrets(env, dev.id);
  const next: DeveloperSecrets = { ...current, savedAt: { ...current.savedAt } };
  const now = deps.now().toISOString();
  const saved: string[] = [];
  const removed: string[] = [];
  for (const key of SECRET_FIELDS) {
    const value = body[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    if (value.trim() === "-") {
      delete next[key];
      delete next.savedAt![key];
      removed.push(key);
    } else {
      next[key] = value.trim();
      next.savedAt![key] = now;
      saved.push(key);
    }
  }
  if (saved.includes("applePrivateKey") && !(await validateAppleKey(next.applePrivateKey!))) {
    throw new HttpError(400, "the Apple private key must be the contents of the .p8 file from App Store Connect (an EC P-256 key)");
  }
  if (saved.includes("githubToken") && !/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(next.githubToken!)) {
    throw new HttpError(400, "that does not look like a GitHub token (expected github_pat_... or ghp_...)");
  }
  await saveSecrets(env, dev.id, next, deps.now());
  if (saved.length > 0) await audit(request, env, deps, dev.id, "credentials-saved", saved.join(", "));
  if (removed.length > 0) await audit(request, env, deps, dev.id, "credentials-removed", removed.join(", "));
  return json({ secrets: secretStatus(next) });
}

// GET /api/dev/apps - apps without a dashboard icon get the latest release icon, best effort.
export async function listApps(env: Env, deps: Deps, dev: Developer): Promise<Response> {
  const apps = await Db.from(env).appsByDeveloper(dev.id);
  const secrets = await loadSecrets(env, dev.id, ["githubToken"]);
  const out = await Promise.all(
    apps.map(async (app) => {
      let releaseIcon = "";
      if (!app.iconUrl) {
        try {
          const icon = (await loadManifest(env, deps, app, secrets.githubToken)).icon;
          releaseIcon = new URL(icon).host === "api.github.com" ? await dlUrl(env, deps, { url: icon, kind: "icon", dev: dev.id }) : icon;
        } catch {
          releaseIcon = "";
        }
      }
      return { ...publicApp(app), releaseIcon };
    }),
  );
  return json({ apps: out });
}

// POST /api/dev/apps - returns the build token once.
export async function createApp(request: Request, env: Env, deps: Deps, dev: Developer): Promise<Response> {
  const body = await readJson<AppInput>(request);
  const now = deps.now().toISOString();
  const buildToken = randomId(24);
  const app: AppRow = {
    id: randomId(8),
    developerId: dev.id,
    name: "",
    tagline: "",
    description: "",
    whatsNew: "",
    size: "",
    minOs: "",
    ageNote: "",
    privacySummary: "",
    iconUrl: "",
    screenshots: [],
    repo: "",
    manifestUrl: "",
    profileName: "",
    showOnPage: false,
    buildTokenHash: await buildTokenHash(env, buildToken),
    createdAt: now,
    updatedAt: now,
  };
  applyInput(app, body);
  await Db.from(env).insertApp(app);
  return json({ app: publicApp(app), buildToken }, 201);
}

// GET /api/dev/apps/:id
export async function getApp(env: Env, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  return json({ app: publicApp(app), links: await db.linksByApp(app.id), profile: await db.latestProfile(app.id).then((p) => (p ? { uuid: p.uuid, expirationDate: p.expirationDate, devices: p.udids.length } : null)) });
}

// PUT /api/dev/apps/:id
export async function updateApp(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  applyInput(app, await readJson<AppInput>(request));
  app.updatedAt = deps.now().toISOString();
  await db.updateApp(app);
  return json({ app: publicApp(app) });
}

// DELETE /api/dev/apps/:id
export async function deleteApp(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  await db.deleteApp(id);
  await audit(request, env, deps, dev.id, "app-deleted", app.name);
  return json({ ok: true });
}

// POST /api/dev/apps/:id/build-token - rotate the per-app token.
export async function rotateBuildToken(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  const buildToken = randomId(24);
  app.buildTokenHash = await buildTokenHash(env, buildToken);
  app.updatedAt = deps.now().toISOString();
  await db.updateApp(app);
  await audit(request, env, deps, dev.id, "build-token-rotated", app.name);
  return json({ buildToken });
}

// POST /api/dev/apps/:id/links
export async function createLink(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  const body = await readJson<{ label?: string; expiresAt?: string | null }>(request);
  let expiresAt: string | null = null;
  if (body.expiresAt) {
    const t = Date.parse(body.expiresAt);
    if (Number.isNaN(t)) throw new HttpError(400, "expiresAt must be a date");
    expiresAt = new Date(t).toISOString();
  }
  const link: LinkRow = { id: randomId(12), appId: app.id, developerId: dev.id, label: text(body.label, 80), createdAt: deps.now().toISOString(), expiresAt, revokedAt: null };
  await db.insertLink(link);
  return json({ link, url: `${env.PUBLIC_ORIGIN}/l/${link.id}` }, 201);
}

// POST /api/dev/links/:id/revoke and DELETE /api/dev/links/:id
export async function revokeLink(env: Env, deps: Deps, dev: Developer, id: string, remove: boolean): Promise<Response> {
  const db = Db.from(env);
  const link = await db.linkById(id);
  if (!link || link.developerId !== dev.id) throw new HttpError(404, "unknown link");
  if (remove) await db.deleteLink(id);
  else await db.revokeLink(id, deps.now().toISOString());
  return json({ ok: true });
}

// GET /api/dev/devices
export async function listDevices(env: Env, dev: Developer): Promise<Response> {
  return json({ enrolments: await Db.from(env).enrolmentsByDeveloper(dev.id) });
}

// POST /api/dev/devices/:id/approve
export async function approveDevice(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const record = await db.enrolmentById(id);
  if (!record || record.developerId !== dev.id) throw new HttpError(404, "unknown device");
  const app = await ownedApp(db, dev, record.appId);
  const profile = await approveEnrolment(env, deps, app, await loadSecrets(env, dev.id), record);
  await audit(request, env, deps, dev.id, "device-approved", `${record.name} for ${app.name}`);
  return json({ enrolment: record, profileUuid: profile.uuid });
}

// POST /api/dev/devices/:id/reject
export async function rejectDevice(request: Request, env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const record = await Db.from(env).enrolmentById(id);
  if (!record || record.developerId !== dev.id) throw new HttpError(404, "unknown device");
  await transition(env, deps, record, "rejected", { message: "The developer declined this device." });
  await audit(request, env, deps, dev.id, "device-rejected", record.name);
  return json({ enrolment: record });
}

// DELETE /api/dev/devices/:id - forget the record; Apple keeps the device slot.
export async function removeDevice(env: Env, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const record = await db.enrolmentById(id);
  if (!record || record.developerId !== dev.id) throw new HttpError(404, "unknown device");
  await db.deleteEnrolment(id);
  return json({ ok: true });
}

// GET /api/dev/apps/:id/release - what the latest release looks like from the store's side.
export async function releaseStatus(env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  const secrets = await loadSecrets(env, dev.id);
  const latest = await db.latestProfile(app.id);
  const profile = latest ? { uuid: latest.uuid, expirationDate: latest.expirationDate, devices: latest.udids.length } : null;
  const base = { githubToken: Boolean(secrets.githubToken), appleKey: appleReady(secrets), profile };
  try {
    const release = await resolveRelease(env, deps, app, secrets.githubToken);
    const manifest = await fetchManifest(env, deps, app, release.manifestUrl, secrets.githubToken);
    return json({
      ok: true,
      ...base,
      tag: release.tag,
      publishedAt: release.publishedAt,
      assets: release.assets,
      manifestUrl: release.manifestUrl,
      version: manifest.version,
      install: { ios: Boolean(manifest.install.ios), android: Boolean(manifest.install.android), pwa: Boolean(manifest.install.pwa) },
      screenshots: (manifest.screenshots ?? []).length,
      errors: [],
    });
  } catch (err) {
    return json({ ok: false, ...base, tag: null, publishedAt: null, assets: [], manifestUrl: null, version: null, install: null, screenshots: 0, errors: [err instanceof Error ? err.message : String(err)] });
  }
}

// GET /api/dev/apps/:id/preview - the install page data without a share link.
export async function previewApp(env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const app = await ownedApp(Db.from(env), dev, id);
  return json({ ...(await buildLinkPage(env, deps, app, dev, null)), preview: true });
}

function publicKey(k: ApiKeyRow) {
  const { keyHash: _hash, ...rest } = k;
  return rest;
}

// GET /api/dev/keys
export async function listKeys(env: Env, dev: Developer): Promise<Response> {
  return json({ keys: (await Db.from(env).apiKeysByDeveloper(dev.id)).map(publicKey) });
}

const MAX_KEY_DAYS = 365;

// POST /api/dev/keys - dashboard only; the key is returned once.
export async function createKey(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<{ name?: string; scope?: string; expiresInDays?: number | null }>(request);
  const scope: KeyScope = body.scope === "read" ? "read" : "manage";
  let expiresAt: string | null = null;
  if (body.expiresInDays !== null && body.expiresInDays !== undefined) {
    const days = Number(body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_KEY_DAYS) throw new HttpError(400, `expiresInDays must be between 1 and ${MAX_KEY_DAYS}, or null for no expiry`);
    expiresAt = new Date(deps.now().getTime() + days * 86_400_000).toISOString();
  }
  const key = newApiKey();
  const row: ApiKeyRow = {
    id: randomId(8),
    developerId: dev.id,
    name: text(body.name, 60) || "Agent",
    prefix: key.slice(0, 11),
    keyHash: await apiKeyHash(env, key),
    scope,
    createdAt: deps.now().toISOString(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  await Db.from(env).insertApiKey(row);
  await audit(request, env, deps, dev.id, "api-key-created", `${row.name} (${scope}${expiresAt ? `, expires ${expiresAt.slice(0, 10)}` : ", no expiry"})`);
  return json({ key, apiKey: publicKey(row) }, 201);
}

// DELETE /api/dev/keys/:id - dashboard only.
export async function revokeKey(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, id: string): Promise<Response> {
  requireSession(dev);
  const ok = await Db.from(env).revokeApiKey(id, dev.id, deps.now().toISOString());
  if (!ok) throw new HttpError(404, "unknown key");
  await audit(request, env, deps, dev.id, "api-key-revoked", id);
  return json({ ok: true });
}

// POST /api/dev/keys/revoke-all - dashboard only.
export async function revokeAllKeys(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const count = await Db.from(env).revokeAllApiKeys(dev.id, deps.now().toISOString());
  await audit(request, env, deps, dev.id, "api-keys-revoked-all", `${count} key${count === 1 ? "" : "s"}`);
  return json({ ok: true, revoked: count });
}

// GET /api/dev/audit - recent security events for this developer.
export async function auditLog(env: Env, dev: Developer): Promise<Response> {
  return json({ events: await Db.from(env).auditFor(dev.id, 50) });
}
