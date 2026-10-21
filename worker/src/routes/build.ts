// Routes an app repo's CI calls with its per-app build token.
import { masterKeys } from "../auth.js";
import { hashMatches, tokenHash } from "../crypto.js";
import { Db, type AppRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { HttpError, bearer, json, readJson } from "../http.js";
import { loadSecrets } from "../secrets.js";
import { commitUpload, reserveUpload } from "../testflight.js";

// Verifies the per-app token; a token stored as a plain hash is rewritten as a keyed hash.
async function requireBuildToken(request: Request, env: Env, app: AppRow): Promise<void> {
  const given = bearer(request);
  if (!given) throw new HttpError(401, "unauthorised");
  const match = await hashMatches(masterKeys(env), "build-token", given, app.buildTokenHash);
  if (!match.ok) throw new HttpError(401, "unauthorised");
  if (match.rewrite) await Db.from(env).rehashBuildToken(app.id, await tokenHash(masterKeys(env), "build-token", given));
}

// GET or HEAD /api/build/:app/signing - everything an iPhone build needs: ourapps' certificate, its
// private key and the app's App Store profile. 404 until signing and TestFlight are set up; HEAD
// answers the same status without the key.
export async function buildSigning(request: Request, env: Env, appId: string): Promise<Response> {
  const db = Db.from(env);
  const app = await db.appById(appId);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, env, app);
  const certificate = await db.signingCertificate(app.developerId);
  if (!certificate) throw new HttpError(404, "iPhone signing is not set up; the developer sets it up under Settings in ourapps");
  if (!app.storeProfileBase64 || !app.storeProfileUuid) throw new HttpError(404, "TestFlight is not set up yet; the developer sets it up on the app's page in ourapps");
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  const secrets = await loadSecrets(env, app.developerId, ["signingKey", "appleTeamId"]);
  if (!secrets.signingKey) throw new HttpError(404, "the signing key is missing; set up iPhone signing again under Settings");
  return json({
    certificate: { id: certificate.certificateId, name: certificate.name, serialNumber: certificate.serialNumber, expirationDate: certificate.expirationDate, base64: certificate.certificateBase64 },
    privateKeyPem: secrets.signingKey,
    teamId: secrets.appleTeamId ?? null,
    storeProfile: { profileName: app.storeProfileName, profileId: app.storeProfileId, uuid: app.storeProfileUuid, profileBase64: app.storeProfileBase64 },
    testflight: { url: app.testflightUrl ?? null },
  });
}

// POST /api/build/:app/testflight/upload and /commit - the workflow uploads its .ipa to Apple through
// operations ourapps reserves, so the repository holds no Apple key.
export async function buildTestflight(request: Request, env: Env, deps: Deps, appId: string, step: "upload" | "commit"): Promise<Response> {
  const app = await Db.from(env).appById(appId);
  if (!app) throw new HttpError(404, "unknown app");
  await requireBuildToken(request, env, app);
  const body = await readJson<Record<string, unknown>>(request);
  return json(step === "upload" ? await reserveUpload(env, deps, app, body) : await commitUpload(env, deps, app, body));
}
