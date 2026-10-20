// The iOS enrolment flow a friend goes through.
import { isFinal, type EnrolmentStatus, type InstallPhase } from "@my/store-shared";
import { SAMPLES, expectedSeconds, median } from "../buildtime.js";
import { randomId } from "../crypto.js";
import { Db, type EnrolmentRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { dlUrl, transition } from "../flow.js";
import { HttpError, json, readJson, text } from "../http.js";
import { enrolmentProfile, parseDeviceReply } from "../mobileconfig.js";
import { loadSecrets } from "../secrets.js";
import { loadManifest } from "../upstream.js";
import { linkActive } from "./public.js";

function installPhase(r: EnrolmentRow): InstallPhase {
  if (!r.installAttemptAt) return "none";
  return r.installDoneAt ? "installed" : r.installStartedAt ? "downloading" : "requested";
}

// The version build-ready reported, kept in the message as "version 1.2.3".
const builtVersion = (r: EnrolmentRow) => /^version (.+)$/.exec(r.message ?? "")?.[1];

const LONG_POLL_MS = 25_000;
const POLL_STEP_MS = 2_000;

// POST /api/enrol/new - the site creates an enrolment before sending the friend to the profile.
export async function enrolNew(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson<{ linkId?: string; name?: string }>(request);
  const name = text(body.name, 60);
  if (!body.linkId || name === "") throw new HttpError(400, "linkId and name are required");
  const db = Db.from(env);
  const link = await db.linkById(body.linkId);
  if (!link) throw new HttpError(404, "no app behind this link");
  if (!linkActive(link, deps.now())) throw new HttpError(410, "this link is no longer active");
  const now = deps.now().toISOString();
  const record: EnrolmentRow = {
    id: randomId(),
    appId: link.appId,
    developerId: link.developerId,
    linkId: link.id,
    name,
    state: "awaiting-device",
    udid: null,
    product: null,
    appleDeviceId: null,
    profileUuid: null,
    manifestUrl: null,
    message: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertEnrolment(record);
  return json({ enrolmentId: record.id, profileUrl: `${env.PUBLIC_ORIGIN}/api/enrol/${record.id}/profile.mobileconfig` }, 201);
}

// GET /api/enrol/:id/profile.mobileconfig
export async function enrolProfile(env: Env, id: string): Promise<Response> {
  const db = Db.from(env);
  const record = await db.enrolmentById(id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  const app = await db.appById(record.appId);
  const dev = app && (await db.developerById(app.developerId));
  const body = enrolmentProfile({
    callbackUrl: `${env.PUBLIC_ORIGIN}/api/enrol/${id}`,
    appName: app?.name ?? "the app",
    organisation: dev?.displayName ?? "ourapps",
    uuid: crypto.randomUUID(),
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-apple-aspen-config", "Content-Disposition": `attachment; filename="install.mobileconfig"`, "Cache-Control": "no-store" },
  });
}

// POST /api/enrol/:id - the device posts its attributes, then Safari is sent to the wait page.
export async function enrolCallback(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const record = await Db.from(env).enrolmentById(id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  const attrs = parseDeviceReply(new Uint8Array(await request.arrayBuffer()));
  if (!attrs) throw new HttpError(400, "device reply did not contain a UDID");
  if (record.state === "awaiting-device") {
    await transition(env, deps, record, "pending-approval", { udid: attrs.udid, product: attrs.product ?? null });
  }
  return Response.redirect(`${env.PUBLIC_ORIGIN}/l/${record.linkId}/wait/${record.id}`, 301);
}

// GET /api/enrol/:id/status?since=<state> - long poll until the state differs or the deadline passes.
export async function enrolStatus(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const db = Db.from(env);
  const since = new URL(request.url).searchParams.get("since");
  const started = deps.now().getTime();
  let record = await db.enrolmentById(id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  while (since && record.state === since && !isFinal(record.state) && deps.now().getTime() - started < LONG_POLL_MS) {
    await deps.sleep(POLL_STEP_MS);
    record = (await db.enrolmentById(id)) ?? record;
  }
  const status: EnrolmentStatus = { id: record.id, state: record.state, app: record.appId, linkId: record.linkId, message: record.message ?? undefined, updatedAt: record.updatedAt };
  if (record.state === "registering" || record.state === "building") {
    const typical = median(await db.recentBuildSeconds(record.appId, SAMPLES));
    const elapsed = record.state === "building" ? Math.max(0, Math.round((deps.now().getTime() - Date.parse(record.updatedAt)) / 1000)) : 0;
    status.build = { elapsedSeconds: elapsed, expectedSeconds: expectedSeconds(typical), typicalSeconds: typical };
  }
  if (record.state === "ready" && record.manifestUrl) {
    status.manifestUrl = await dlUrl(env, deps, { url: record.manifestUrl, kind: "manifest", dev: record.developerId, e: record.id, v: builtVersion(record) });
    status.install = { attemptAt: record.installAttemptAt ?? null, phase: installPhase(record), version: record.installedVersion ?? null };
  }
  return json(status);
}

// GET /api/enrol/:id/latest - an install link for the newest release, for a device that is already
// in the app's profile: updates and reinstalls need no new registration.
export async function enrolLatest(env: Env, deps: Deps, id: string): Promise<Response> {
  const db = Db.from(env);
  const record = await db.enrolmentById(id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  if (record.state !== "ready") throw new HttpError(409, "this device is not ready to install yet");
  const link = await db.linkById(record.linkId);
  if (!link || !linkActive(link, deps.now())) throw new HttpError(410, "this link is no longer active");
  const app = await db.appById(record.appId);
  if (!app) throw new HttpError(404, "unknown app");
  const secrets = await loadSecrets(env, app.developerId, ["githubToken"]);
  let manifest: Awaited<ReturnType<typeof loadManifest>>;
  try {
    manifest = await loadManifest(env, deps, app, secrets.githubToken);
  } catch (err) {
    console.error(`latest for enrolment ${id}: ${err instanceof Error ? err.message : String(err)}`);
    throw new HttpError(503, "no release of this app is available right now");
  }
  const adhoc = manifest.install.ios?.adhoc;
  if (!adhoc) throw new HttpError(404, "the latest release has no iPhone build");
  return json({ version: manifest.version, manifestUrl: await dlUrl(env, deps, { url: adhoc, kind: "manifest", dev: app.developerId, e: record.id, v: manifest.version }) });
}
