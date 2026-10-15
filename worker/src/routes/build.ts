// Routes an app repo's CI calls with its per-app build token.
import { sha256Hex, timingSafeEqual } from "../crypto.js";
import { Db, type AppRow, type EnrolmentRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { rebuildPayload, transition } from "../flow.js";
import { dispatchRebuild } from "../github.js";
import { HttpError, bearer, json, readJson } from "../http.js";
import { loadSecrets } from "../secrets.js";

async function requireBuildToken(request: Request, app: AppRow): Promise<void> {
  const given = bearer(request);
  if (!given || !timingSafeEqual(await sha256Hex(given), app.buildTokenHash)) throw new HttpError(401, "unauthorised");
}

// GET /api/build/:app/profile - the CI fetches the profile the store created.
export async function buildProfile(request: Request, env: Env, appId: string): Promise<Response> {
  const db = Db.from(env);
  const app = await db.appById(appId);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, app);
  const profile = await db.latestProfile(app.id);
  if (!profile) throw new HttpError(404, "no profile has been created for this app yet");
  return json({ profileName: profile.profileName, profileId: profile.profileId, uuid: profile.uuid, profileBase64: profile.profileBase64, expirationDate: profile.expirationDate });
}

// POST /api/build-ready - only devices inside the signed profile become ready; others get a new build.
export async function buildReady(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson<{ app?: string; manifestUrl?: string; version?: string; profileUuid?: string }>(request);
  if (!body.app) throw new HttpError(400, "app is required");
  const db = Db.from(env);
  const app = await db.appById(body.app);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, app);
  if (!body.manifestUrl || !body.profileUuid) throw new HttpError(400, "app, manifestUrl and profileUuid are required");
  const built = await db.profileByUuid(app.id, body.profileUuid);
  if (!built) throw new HttpError(409, "profileUuid does not match a profile this store created");
  const inProfile = new Set(built.udids);
  const ready: string[] = [];
  const late: EnrolmentRow[] = [];
  for (const record of await db.enrolmentsByApp(app.id)) {
    if (record.state !== "building" || !record.udid) continue;
    if (inProfile.has(record.udid)) {
      await transition(env, deps, record, "ready", { manifestUrl: body.manifestUrl, message: body.version ? `version ${body.version}` : null });
      ready.push(record.id);
    } else {
      late.push(record);
    }
  }
  let redispatched = false;
  if (late.length > 0) {
    const latest = await db.latestProfile(app.id);
    if (latest && latest.uuid !== body.profileUuid) {
      const secrets = await loadSecrets(env, app.developerId);
      await dispatchRebuild(env, deps, secrets.githubToken, app.repo, rebuildPayload(env, app, late[0], latest));
      redispatched = true;
    }
  }
  return json({ ready, waiting: late.map((r) => r.id), redispatched });
}
