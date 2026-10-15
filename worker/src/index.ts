import { canTransition, isEnrolmentState, isFinal, type AppManifest, type EnrolmentStatus } from "@my/store-shared";
import { AppleClient, appleConfigured } from "./apple.js";
import { defaultDeps, type Deps, type Env } from "./env.js";
import { dispatchRebuild } from "./github.js";
import { HttpError, corsHeaders, json, readJson, requireToken } from "./http.js";
import { linkExpiry, signLink, verifyLink, type LinkPayload } from "./links.js";
import { enrolmentProfile, parseDeviceReply } from "./mobileconfig.js";
import {
  deleteApp,
  getApp,
  getAppByLink,
  getEnrolment,
  getProfile,
  listApps,
  listEnrolments,
  putApp,
  putEnrolment,
  putProfile,
  randomId,
  type AppRecord,
  type EnrolmentRecord,
  type ProfileRecord,
} from "./store.js";
import { fetchUpstream, loadManifest } from "./upstream.js";

const LONG_POLL_MS = 25_000;
const POLL_STEP_MS = 2_000;
const ORGANISATION = "George McIntyre";

export async function handle(request: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  const cors = corsHeaders(env, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const res = await route(request, env, deps);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "unknown error";
    if (status >= 500) console.error(message);
    return json({ error: message }, status, cors);
  }
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const m = request.method;

  if (parts[0] === "dl" && parts.length === 2 && m === "GET") return serveArtefact(request, env, deps, parts[1]);
  if (parts[0] !== "api") throw new HttpError(404, "not found");
  const p = parts.slice(1);

  if (p[0] === "health" && m === "GET") return json({ ok: true, apple: appleConfigured(env), github: Boolean(env.GITHUB_TOKEN) });
  if (p[0] === "apps" && p.length === 2 && m === "GET") return appPage(request, env, deps, p[1]);

  if (p[0] === "enrol") {
    if (p[1] === "new" && m === "POST") return enrolNew(request, env, deps);
    if (p.length === 3 && p[2] === "profile.mobileconfig" && m === "GET") return enrolProfile(request, env, p[1]);
    if (p.length === 2 && m === "POST") return enrolCallback(request, env, deps, p[1]);
    if (p.length === 3 && p[2] === "status" && m === "GET") return enrolStatus(request, env, deps, p[1]);
  }

  if (p[0] === "build-ready" && m === "POST") return buildReady(request, env, deps);
  if (p[0] === "build" && p.length === 3 && p[2] === "profile" && m === "GET") return buildProfile(request, env, p[1]);

  if (p[0] === "admin") {
    requireToken(request, env.ADMIN_TOKEN, "ADMIN_TOKEN");
    if (p[1] === "apps" && p.length === 2 && m === "GET") return json({ apps: await listApps(env) });
    if (p[1] === "apps" && p.length === 2 && m === "POST") return adminAddApp(request, env, deps);
    if (p[1] === "apps" && p.length === 3 && m === "DELETE") {
      await deleteApp(env, p[2]);
      return json({ ok: true });
    }
    if (p[1] === "enrolments" && p.length === 2 && m === "GET") {
      return json({ enrolments: await listEnrolments(env, url.searchParams.get("app") ?? undefined) });
    }
    if (p[1] === "enrolments" && p.length === 4 && p[3] === "approve" && m === "POST") return adminApprove(request, env, deps, p[2]);
    if (p[1] === "enrolments" && p.length === 4 && p[3] === "reject" && m === "POST") return adminReject(env, deps, p[2]);
  }
  throw new HttpError(404, "not found");
}

// Public: what the install page needs, with artefact links already signed.
async function appPage(request: Request, env: Env, deps: Deps, linkId: string): Promise<Response> {
  const app = await getAppByLink(env, linkId);
  if (!app) throw new HttpError(404, "no app behind this link");
  const manifest = await loadManifest(env, deps, app);
  const signed = await signManifestLinks(env, deps, request, manifest);
  return json({ linkId, app: signed }, 200, { "Cache-Control": "no-store" });
}

async function signManifestLinks(env: Env, deps: Deps, request: Request, manifest: AppManifest): Promise<AppManifest> {
  const out: AppManifest = structuredClone(manifest);
  if (out.install.android) out.install.android.apk = await dlUrl(env, deps, request, { url: manifest.install.android!.apk, kind: "apk" });
  if (out.install.ios?.adhoc) out.install.ios.adhoc = await dlUrl(env, deps, request, { url: manifest.install.ios!.adhoc!, kind: "manifest" });
  return out;
}

async function dlUrl(env: Env, deps: Deps, request: Request, link: Omit<LinkPayload, "exp">): Promise<string> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const token = await signLink(env.LINK_SECRET, { ...link, exp: linkExpiry(deps.now()) });
  return `${new URL(request.url).origin}/dl/${token}`;
}

// Public: stream an artefact behind a signed link; manifests get their .ipa links re-signed.
async function serveArtefact(request: Request, env: Env, deps: Deps, token: string): Promise<Response> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const link = await verifyLink(env.LINK_SECRET, token, deps.now());
  if (!link) throw new HttpError(403, "this link has expired; open the install page again");
  const upstream = await fetchUpstream(env, deps, link.url);
  if (!upstream.ok) throw new HttpError(502, `upstream returned ${upstream.status}`);
  if (link.kind === "manifest") {
    const plist = await upstream.text();
    const rewritten = await rewriteManifestUrls(plist, (u) => dlUrl(env, deps, request, { url: u, kind: "ipa" }));
    return new Response(rewritten, { status: 200, headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
  }
  const type = link.kind === "apk" ? "application/vnd.android.package-archive" : "application/octet-stream";
  const name = link.kind === "apk" ? "app.apk" : "app.ipa";
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

// Replace every <key>url</key><string>...</string> in a manifest.plist.
export async function rewriteManifestUrls(plist: string, replace: (url: string) => Promise<string>): Promise<string> {
  const re = /(<key>url<\/key>\s*<string>)([^<]+)(<\/string>)/g;
  const matches = [...plist.matchAll(re)];
  let out = "";
  let last = 0;
  for (const match of matches) {
    const [whole, open, value, close] = match;
    out += plist.slice(last, match.index) + open + (await replace(value.trim())) + close;
    last = match.index + whole.length;
  }
  return out + plist.slice(last);
}

// Public: the site creates an enrolment before sending the friend to the profile.
async function enrolNew(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson<{ linkId?: string; name?: string }>(request);
  const name = (body.name ?? "").trim().slice(0, 60);
  if (!body.linkId || name === "") throw new HttpError(400, "linkId and name are required");
  const app = await getAppByLink(env, body.linkId);
  if (!app) throw new HttpError(404, "no app behind this link");
  const now = deps.now().toISOString();
  const record: EnrolmentRecord = { id: randomId(), app: app.id, linkId: app.linkId, name, state: "awaiting-device", createdAt: now, updatedAt: now };
  await putEnrolment(env, record);
  return json({ enrolmentId: record.id, profileUrl: `${new URL(request.url).origin}/api/enrol/${record.id}/profile.mobileconfig` }, 201);
}

async function enrolProfile(request: Request, env: Env, id: string): Promise<Response> {
  const record = await getEnrolment(env, id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  const app = await getApp(env, record.app);
  const body = enrolmentProfile({
    callbackUrl: `${new URL(request.url).origin}/api/enrol/${id}`,
    appName: app?.id ?? record.app,
    organisation: ORGANISATION,
    uuid: crypto.randomUUID(),
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-apple-aspen-config", "Content-Disposition": `attachment; filename="install.mobileconfig"`, "Cache-Control": "no-store" },
  });
}

// The device posts its attributes here, then Safari is sent to the wait page.
async function enrolCallback(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const record = await getEnrolment(env, id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  const attrs = parseDeviceReply(new Uint8Array(await request.arrayBuffer()));
  if (!attrs) throw new HttpError(400, "device reply did not contain a UDID");
  if (record.state === "awaiting-device") {
    await transition(env, deps, record, "pending-approval", { udid: attrs.udid, product: attrs.product });
  }
  return Response.redirect(`${env.SITE_ORIGIN}${env.SITE_BASE}#/${record.linkId}/wait/${record.id}`, 301);
}

// Long poll: return as soon as the state differs from ?since=, or after LONG_POLL_MS.
async function enrolStatus(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const since = new URL(request.url).searchParams.get("since");
  const started = deps.now().getTime();
  let record = await getEnrolment(env, id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  while (since && record.state === since && !isFinal(record.state) && deps.now().getTime() - started < LONG_POLL_MS) {
    await deps.sleep(POLL_STEP_MS);
    record = (await getEnrolment(env, id)) ?? record;
  }
  const status: EnrolmentStatus = { id: record.id, state: record.state, app: record.app, linkId: record.linkId, message: record.message, updatedAt: record.updatedAt };
  if (record.state === "ready" && record.manifestUrl) status.manifestUrl = await dlUrl(env, deps, request, { url: record.manifestUrl, kind: "manifest" });
  return json(status, 200, { "Cache-Control": "no-store" });
}

// The app's CI fetches the profile the store created for it.
async function buildProfile(request: Request, env: Env, appId: string): Promise<Response> {
  requireToken(request, env.BUILD_TOKEN, "BUILD_TOKEN");
  const profile = await getProfile(env, appId);
  if (!profile) throw new HttpError(404, "no profile has been created for this app yet");
  return json({ profileName: profile.profileName, profileId: profile.profileId, uuid: profile.uuid, profileBase64: profile.profileBase64, expirationDate: profile.expirationDate });
}

// The app's CI reports a published build; only devices inside that profile become ready.
async function buildReady(request: Request, env: Env, deps: Deps): Promise<Response> {
  requireToken(request, env.BUILD_TOKEN, "BUILD_TOKEN");
  const body = await readJson<{ app?: string; manifestUrl?: string; version?: string; profileUuid?: string }>(request);
  if (!body.app || !body.manifestUrl || !body.profileUuid) throw new HttpError(400, "app, manifestUrl and profileUuid are required");
  const app = await getApp(env, body.app);
  if (!app) throw new HttpError(404, "unknown app");
  const built = await env.STORE.get<ProfileRecord>(`profile:${app.id}:${body.profileUuid}`, "json");
  if (!built) throw new HttpError(409, "profileUuid does not match a profile this store created");
  const inProfile = new Set(built.udids);
  const ready: string[] = [];
  const late: EnrolmentRecord[] = [];
  for (const record of await listEnrolments(env, app.id)) {
    if (record.state !== "building" || !record.udid) continue;
    if (inProfile.has(record.udid)) {
      await transition(env, deps, record, "ready", { manifestUrl: body.manifestUrl, message: body.version ? `version ${body.version}` : undefined });
      ready.push(record.id);
    } else {
      late.push(record);
    }
  }
  let redispatched = false;
  if (late.length > 0) {
    const latest = await getProfile(env, app.id);
    if (latest && latest.uuid !== body.profileUuid) {
      await dispatchRebuild(env, deps, app.repo, rebuildPayload(request, env, app, late[0], latest));
      redispatched = true;
    }
  }
  return json({ ready, waiting: late.map((r) => r.id), redispatched });
}

async function adminAddApp(request: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await readJson<{ id?: string; repo?: string; profileName?: string; manifestUrl?: string }>(request);
  if (!body.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.id)) throw new HttpError(400, "id must be a lowercase slug");
  if (!body.repo || !/^[\w.-]+\/[\w.-]+$/.test(body.repo)) throw new HttpError(400, "repo must be owner/name");
  if (!body.profileName) throw new HttpError(400, "profileName is required");
  const existing = await getApp(env, body.id);
  const app: AppRecord = {
    id: body.id,
    linkId: existing?.linkId ?? randomId(12),
    repo: body.repo,
    manifestUrl: body.manifestUrl || undefined,
    profileName: body.profileName,
    createdAt: existing?.createdAt ?? deps.now().toISOString(),
  };
  await putApp(env, app);
  return json({ app, pageUrl: `${env.SITE_ORIGIN}${env.SITE_BASE}#/${app.linkId}` }, existing ? 200 : 201);
}

// Approve: register with Apple, recreate the profile, ask the app repo to rebuild.
async function adminApprove(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const record = await getEnrolment(env, id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  if (!record.udid) throw new HttpError(409, "device has not sent its UDID yet");
  if (!canTransition(record.state, "registering")) throw new HttpError(409, `cannot approve from state ${record.state}`);
  const app = await getApp(env, record.app);
  if (!app) throw new HttpError(404, "unknown app");
  if (!appleConfigured(env)) throw new HttpError(503, "Apple API secrets are not configured");
  await transition(env, deps, record, "registering", { message: undefined });
  try {
    const apple = new AppleClient(env, deps);
    record.appleDeviceId = await apple.registerDevice(record.udid, `${record.name} (${record.product ?? "iPhone"})`);
    const devices = await apple.listEnabledIosDevices();
    const created = await apple.recreateAdHocProfile(app.profileName, devices.map((d) => d.id));
    const profile: ProfileRecord = {
      app: app.id,
      profileId: created.id,
      profileName: app.profileName,
      uuid: created.uuid,
      profileBase64: created.profileContent,
      udids: devices.map((d) => d.attributes.udid),
      expirationDate: created.expirationDate,
      createdAt: deps.now().toISOString(),
    };
    await putProfile(env, profile);
    await env.STORE.put(`profile:${app.id}:${profile.uuid}`, JSON.stringify(profile));
    await dispatchRebuild(env, deps, app.repo, rebuildPayload(request, env, app, record, profile));
    await transition(env, deps, record, "building", { profileUuid: profile.uuid });
    return json({ enrolment: record, profileUuid: profile.uuid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await transition(env, deps, record, "failed", { message });
    throw new HttpError(502, message);
  }
}

async function adminReject(env: Env, deps: Deps, id: string): Promise<Response> {
  const record = await getEnrolment(env, id);
  if (!record) throw new HttpError(404, "unknown enrolment");
  if (!canTransition(record.state, "rejected")) throw new HttpError(409, `cannot reject from state ${record.state}`);
  await transition(env, deps, record, "rejected", { message: "The developer declined this device." });
  return json({ enrolment: record });
}

function rebuildPayload(request: Request, env: Env, app: AppRecord, record: EnrolmentRecord, profile: ProfileRecord) {
  const origin = new URL(request.url).origin;
  return {
    app: app.id,
    enrolmentId: record.id,
    udid: record.udid ?? "",
    deviceName: record.name,
    profileName: profile.profileName,
    profileId: profile.profileId,
    profileUuid: profile.uuid,
    buildReadyUrl: `${origin}/api/build-ready`,
    profileUrl: `${origin}/api/build/${app.id}/profile`,
  };
}

async function transition(env: Env, deps: Deps, record: EnrolmentRecord, to: EnrolmentRecord["state"], patch: Partial<EnrolmentRecord>): Promise<void> {
  if (!isEnrolmentState(to) || !canTransition(record.state, to)) throw new HttpError(409, `cannot move from ${record.state} to ${to}`);
  Object.assign(record, patch, { state: to, updatedAt: deps.now().toISOString() });
  await putEnrolment(env, record);
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
} satisfies ExportedHandler<Env>;
