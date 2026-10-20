// Routes an app repo's CI calls with its per-app build token.
import { masterKeys } from "../auth.js";
import { hashMatches, tokenHash } from "../crypto.js";
import { Db, type AppRow, type EnrolmentRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { rebuildPayload, transition } from "../flow.js";
import { dispatchRebuild } from "../github.js";
import { HttpError, bearer, json, readJson } from "../http.js";
import { loadSecrets } from "../secrets.js";

// Verifies the per-app token; a token stored as a plain hash is rewritten as a keyed hash.
async function requireBuildToken(request: Request, env: Env, app: AppRow): Promise<void> {
  const given = bearer(request);
  if (!given) throw new HttpError(401, "unauthorised");
  const match = await hashMatches(masterKeys(env), "build-token", given, app.buildTokenHash);
  if (!match.ok) throw new HttpError(401, "unauthorised");
  if (match.rewrite) await Db.from(env).rehashBuildToken(app.id, await tokenHash(masterKeys(env), "build-token", given));
}

// GET /api/build/:app/profile - the CI fetches the profile the store created.
export async function buildProfile(request: Request, env: Env, appId: string): Promise<Response> {
  const db = Db.from(env);
  const app = await db.appById(appId);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, env, app);
  const profile = await db.latestProfile(app.id);
  if (!profile) throw new HttpError(404, "no profile has been created for this app yet");
  return json({ profileName: profile.profileName, profileId: profile.profileId, uuid: profile.uuid, profileBase64: profile.profileBase64, expirationDate: profile.expirationDate });
}

// GET or HEAD /api/build/:app/signing - everything an iPhone build needs: ourapps' certificate, its
// private key and the latest Ad Hoc profile. 404 until signing is set up and the profile exists;
// HEAD answers the same status without the key, for deciding whether to build for iPhone.
export async function buildSigning(request: Request, env: Env, appId: string): Promise<Response> {
  const db = Db.from(env);
  const app = await db.appById(appId);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, env, app);
  const certificate = await db.signingCertificate(app.developerId);
  if (!certificate) throw new HttpError(404, "iPhone signing is not set up; the developer sets it up under Settings in ourapps");
  const profile = await db.latestProfile(app.id);
  if (!profile) throw new HttpError(404, "no Ad Hoc profile yet; it is made when the app has a bundle ID and a device is registered");
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  const secrets = await loadSecrets(env, app.developerId, ["signingKey", "appleTeamId"]);
  if (!secrets.signingKey) throw new HttpError(404, "the signing key is missing; set up iPhone signing again under Settings");
  return json({
    certificate: { id: certificate.certificateId, name: certificate.name, serialNumber: certificate.serialNumber, expirationDate: certificate.expirationDate, base64: certificate.certificateBase64 },
    privateKeyPem: secrets.signingKey,
    teamId: secrets.appleTeamId ?? null,
    profile: { profileName: profile.profileName, profileId: profile.profileId, uuid: profile.uuid, profileBase64: profile.profileBase64, expirationDate: profile.expirationDate },
  });
}

// POST /api/build-ready - only devices inside the signed profile become ready; others get a new build.
export async function buildReady(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson<{ app?: string; manifestUrl?: string; version?: string; profileUuid?: string }>(request);
  if (!body.app) throw new HttpError(400, "app is required");
  const db = Db.from(env);
  const app = await db.appById(body.app);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, env, app);
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
      const secrets = await loadSecrets(env, app.developerId, ["githubToken"]);
      await dispatchRebuild(env, deps, secrets.githubToken, app.repo, rebuildPayload(env, app, late[0], latest));
      redispatched = true;
    }
  }
  return json({ ready, waiting: late.map((r) => r.id), redispatched });
}
