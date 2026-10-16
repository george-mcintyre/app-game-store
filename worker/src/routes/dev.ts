// Developer dashboard routes, all behind the session cookie.
import { RESERVED_SLUGS, normaliseSlug } from "../auth.js";
import { randomId, sha256Hex } from "../crypto.js";
import { Db, type AppRow, type Developer, type DeveloperSecrets, type LinkRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { approveEnrolment, dlUrl, transition } from "../flow.js";
import { HttpError, httpsUrlOrEmpty, json, readJson, text } from "../http.js";
import { appleReady, loadSecrets, saveSecrets } from "../secrets.js";
import { loadManifest } from "../upstream.js";

type AppInput = Partial<Record<"name" | "tagline" | "description" | "whatsNew" | "size" | "minOs" | "ageNote" | "privacySummary" | "iconUrl" | "repo" | "manifestUrl" | "profileName", string>> & {
  screenshots?: unknown;
  showOnPage?: unknown;
};

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

// GET /api/dev/me
export async function me(env: Env, dev: Developer): Promise<Response> {
  const secrets = await loadSecrets(env, dev.id);
  return json({ developer: dev, secrets: { apple: appleReady(secrets), appleTeamId: secrets.appleTeamId ?? "", github: Boolean(secrets.githubToken) } });
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

// PUT /api/dev/secrets - blank fields keep their current value; "-" clears one.
export async function updateSecrets(request: Request, env: Env, deps: Deps, dev: Developer): Promise<Response> {
  const body = await readJson<Partial<DeveloperSecrets>>(request);
  const current = await loadSecrets(env, dev.id);
  const next: DeveloperSecrets = { ...current };
  for (const key of ["appleIssuerId", "appleKeyId", "applePrivateKey", "appleTeamId", "githubToken"] as const) {
    const value = body[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    if (value.trim() === "-") delete next[key];
    else next[key] = value.trim();
  }
  if (next.applePrivateKey && !next.applePrivateKey.includes("PRIVATE KEY")) throw new HttpError(400, "the Apple private key must be the .p8 file contents");
  await saveSecrets(env, dev.id, next, deps.now());
  return json({ secrets: { apple: appleReady(next), appleTeamId: next.appleTeamId ?? "", github: Boolean(next.githubToken) } });
}

// GET /api/dev/apps - apps without a dashboard icon get the latest release icon, best effort.
export async function listApps(env: Env, deps: Deps, dev: Developer): Promise<Response> {
  const apps = await Db.from(env).appsByDeveloper(dev.id);
  const secrets = await loadSecrets(env, dev.id);
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
    buildTokenHash: await sha256Hex(buildToken),
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
export async function deleteApp(env: Env, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  await ownedApp(db, dev, id);
  await db.deleteApp(id);
  return json({ ok: true });
}

// POST /api/dev/apps/:id/build-token - rotate the per-app token.
export async function rotateBuildToken(env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const app = await ownedApp(db, dev, id);
  const buildToken = randomId(24);
  app.buildTokenHash = await sha256Hex(buildToken);
  app.updatedAt = deps.now().toISOString();
  await db.updateApp(app);
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
export async function approveDevice(env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const db = Db.from(env);
  const record = await db.enrolmentById(id);
  if (!record || record.developerId !== dev.id) throw new HttpError(404, "unknown device");
  const app = await ownedApp(db, dev, record.appId);
  const profile = await approveEnrolment(env, deps, app, await loadSecrets(env, dev.id), record);
  return json({ enrolment: record, profileUuid: profile.uuid });
}

// POST /api/dev/devices/:id/reject
export async function rejectDevice(env: Env, deps: Deps, dev: Developer, id: string): Promise<Response> {
  const record = await Db.from(env).enrolmentById(id);
  if (!record || record.developerId !== dev.id) throw new HttpError(404, "unknown device");
  await transition(env, deps, record, "rejected", { message: "The developer declined this device." });
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
