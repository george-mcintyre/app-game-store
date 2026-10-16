import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { BASE, api, appleRoutes, clearDb, createSkull, deviceReply, enrol, fakeFetch, githubRoutes, saveAppleSecrets, signIn, status, testDeps, testEnv, type TestDeps } from "./helpers.js";

const UDID_1 = "00008030-000A1B2C3D4E5F67";
const UDID_2 = "00008030-000F0E0D0C0B0A09";

let env: Env;
let deps: TestDeps;
let cookie: string;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
  deps = testDeps(fakeFetch(githubRoutes()).fetch);
  cookie = await signIn(env, deps);
});

describe("apps", () => {
  it("creates an app, returns the build token once, and lists it", async () => {
    const res = await handle(api(cookie, "POST", "/api/dev/apps", { name: "Skull", repo: "o/skull", screenshots: ["https://x/1.png", ""], showOnPage: true }), env, deps);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { app: Record<string, unknown>; buildToken: string };
    expect(body.buildToken).toMatch(/^[0-9a-f]{48}$/);
    expect(body.app).toMatchObject({ name: "Skull", repo: "o/skull", screenshots: ["https://x/1.png"], showOnPage: true });
    expect(body.app.buildTokenHash).toBeUndefined();
    const list = (await (await handle(api(cookie, "GET", "/api/dev/apps"), env, deps)).json()) as { apps: { id: string; releaseIcon: string }[] };
    expect(list.apps).toHaveLength(1);
    expect(list.apps[0].releaseIcon).toMatch(new RegExp(`^${BASE}/dl/`));
    const offline = (await (await handle(api(cookie, "GET", "/api/dev/apps"), env, testDeps())).json()) as { apps: { releaseIcon: string }[] };
    expect(offline.apps[0].releaseIcon).toBe("");
  });

  it("validates input", async () => {
    expect((await handle(api(cookie, "POST", "/api/dev/apps", { name: "", repo: "o/skull" }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "POST", "/api/dev/apps", { name: "X", repo: "nope" }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "POST", "/api/dev/apps", { name: "X", repo: "o/x", iconUrl: "http://x" }), env, deps)).status).toBe(400);
  });

  it("updates, rotates the token and deletes, only for the owner", async () => {
    const { appId, buildToken } = await createSkull(env, deps, cookie);
    const upd = await handle(api(cookie, "PUT", `/api/dev/apps/${appId}`, { tagline: "New line" }), env, deps);
    expect(((await upd.json()) as { app: { tagline: string; name: string } }).app).toMatchObject({ tagline: "New line", name: "Skull" });

    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    expect((await handle(api(other, "GET", `/api/dev/apps/${appId}`), env, deps)).status).toBe(404);
    expect((await handle(api(other, "DELETE", `/api/dev/apps/${appId}`), env, deps)).status).toBe(404);

    const rot = (await (await handle(api(cookie, "POST", `/api/dev/apps/${appId}/build-token`), env, deps)).json()) as { buildToken: string };
    expect(rot.buildToken).not.toBe(buildToken);
    expect((await handle(api(null, "GET", `/api/build/${appId}/profile`, undefined, { Authorization: `Bearer ${buildToken}` }), env, deps)).status).toBe(401);
    expect((await handle(api(null, "GET", `/api/build/${appId}/profile`, undefined, { Authorization: `Bearer ${rot.buildToken}` }), env, deps)).status).toBe(404);

    expect((await handle(api(cookie, "DELETE", `/api/dev/apps/${appId}`), env, deps)).status).toBe(200);
    expect((await handle(api(cookie, "GET", `/api/dev/apps/${appId}`), env, deps)).status).toBe(404);
  });
});

describe("share links and public pages", () => {
  it("serves the install page with signed artefact links", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const { fetch, calls } = fakeFetch(githubRoutes());
    const d = { ...deps, fetch };
    const res = await handle(api(null, "GET", `/api/public/links/${linkId}`), env, d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { app: { name: string; tagline: string }; developer: { displayName: string }; release: { version: string; fallbackIcon: string; fallbackScreenshots: string[]; install: { android: { apk: string }; ios: { adhoc: string } } } };
    expect(body.release.fallbackIcon).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(body.release.fallbackScreenshots[0]).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(body.release.fallbackScreenshots[1]).toBe("https://cdn.example.com/2.png");
    expect(await (await handle(new Request(body.release.fallbackScreenshots[0]), env, d)).text()).toBe("SHOT");
    const icon = await handle(new Request(body.release.fallbackIcon), env, d);
    expect(icon.headers.get("Content-Type")).toBe("image/png");
    expect(await icon.text()).toBe("PNGBYTES");
    expect(body.app).toMatchObject({ name: "Skull", tagline: "Bluff your friends" });
    expect(body.developer.displayName).toBe("George");
    expect(body.release.version).toBe("0.1.0");
    expect(body.release.install.android.apk).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(calls[0].headers.get("Authorization")).toBe("Bearer ghp_dev");

    const apk = await handle(new Request(body.release.install.android.apk), env, d);
    expect(apk.headers.get("Content-Type")).toBe("application/vnd.android.package-archive");
    expect(await apk.text()).toBe("APKBYTES");

    const plist = await handle(new Request(body.release.install.ios.adhoc), env, d);
    expect(plist.headers.get("Content-Type")).toBe("text/xml");
    const text = await plist.text();
    expect(text).not.toContain("api.github.com");
    const ipaUrl = /<key>url<\/key><string>([^<]+)<\/string>/.exec(text)![1];
    expect(await (await handle(new Request(ipaUrl), env, d)).text()).toBe("IPABYTES");
  });

  it("still serves details when the release cannot be loaded", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const res = await handle(api(null, "GET", `/api/public/links/${linkId}`), env, testDeps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { release: null; releaseError: string };
    expect(body.release).toBeNull();
    expect(body.releaseError).toMatch(/599/);
  });

  it("refuses expired and tampered artefact links", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const body = (await (await handle(api(null, "GET", `/api/public/links/${linkId}`), env, deps)).json()) as { release: { install: { android: { apk: string } } } };
    deps.advance(61 * 60 * 1000);
    expect((await handle(new Request(body.release.install.android.apk), env, deps)).status).toBe(403);
    expect((await handle(new Request(`${body.release.install.android.apk}x`), env, deps)).status).toBe(403);
  });

  it("treats revoked and expired share links as inactive", async () => {
    const { appId } = await createSkull(env, deps, cookie);
    const expiring = (await (await handle(api(cookie, "POST", `/api/dev/apps/${appId}/links`, { label: "short", expiresAt: "2026-10-16T11:00:00Z" }), env, deps)).json()) as { link: { id: string } };
    expect((await handle(api(null, "GET", `/api/public/links/${expiring.link.id}`), env, deps)).status).toBe(200);
    deps.advance(2 * 3600_000);
    expect((await handle(api(null, "GET", `/api/public/links/${expiring.link.id}`), env, deps)).status).toBe(410);

    const live = (await (await handle(api(cookie, "POST", `/api/dev/apps/${appId}/links`, {}), env, deps)).json()) as { link: { id: string } };
    expect((await handle(api(cookie, "POST", `/api/dev/links/${live.link.id}/revoke`), env, deps)).status).toBe(200);
    expect((await handle(api(null, "GET", `/api/public/links/${live.link.id}`), env, deps)).status).toBe(410);
    expect((await handle(api(null, "POST", "/api/enrol/new", { linkId: live.link.id, name: "Bob" }), env, deps)).status).toBe(410);
    expect((await handle(api(null, "GET", "/api/public/links/nope"), env, deps)).status).toBe(404);
  });

  it("shows only opted-in apps on the developer page", async () => {
    const { appId } = await createSkull(env, deps, cookie);
    await handle(api(cookie, "POST", "/api/dev/apps", { name: "Hidden", repo: "o/hidden" }), env, deps);
    await handle(api(cookie, "PUT", `/api/dev/apps/${appId}`, { showOnPage: true }), env, deps);
    const res = await handle(api(null, "GET", "/api/public/dev/george"), env, deps);
    const body = (await res.json()) as { developer: { displayName: string }; apps: Record<string, unknown>[] };
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].name).toBe("Skull");
    expect(body.apps[0].repo).toBeUndefined();
    expect((await handle(api(null, "GET", "/api/public/dev/nobody"), env, deps)).status).toBe(404);
  });
});

describe("enrolment", () => {
  it("creates an enrolment and serves the profile", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const created = await handle(api(null, "POST", "/api/enrol/new", { linkId, name: "Bob" }), env, deps);
    const { enrolmentId, profileUrl } = (await created.json()) as { enrolmentId: string; profileUrl: string };
    expect(profileUrl).toBe(`${BASE}/api/enrol/${enrolmentId}/profile.mobileconfig`);
    const profile = await handle(new Request(profileUrl), env, deps);
    expect(profile.headers.get("Content-Type")).toBe("application/x-apple-aspen-config");
    const text = await profile.text();
    expect(text).toContain("<string>Profile Service</string>");
    expect(text).toContain(`<string>${BASE}/api/enrol/${enrolmentId}</string>`);
    expect(text).toContain("Install Skull");
    expect((await status(env, deps, enrolmentId)).state).toBe("awaiting-device");
  });

  it("requires a name and a known link", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    expect((await handle(api(null, "POST", "/api/enrol/new", { linkId, name: " " }), env, deps)).status).toBe(400);
    expect((await handle(api(null, "POST", "/api/enrol/new", { linkId: "zzz", name: "Bob" }), env, deps)).status).toBe(404);
    expect((await handle(api(null, "POST", "/api/enrol/new", "not json"), env, deps)).status).toBe(400);
  });

  it("records the UDID and redirects to the wait page", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const created = await handle(api(null, "POST", "/api/enrol/new", { linkId, name: "Bob" }), env, deps);
    const { enrolmentId } = (await created.json()) as { enrolmentId: string };
    const cb = await handle(new Request(`${BASE}/api/enrol/${enrolmentId}`, { method: "POST", body: deviceReply(UDID_1) }), env, deps);
    expect(cb.status).toBe(301);
    expect(cb.headers.get("Location")).toBe(`${BASE}/l/${linkId}/wait/${enrolmentId}`);
    expect((await status(env, deps, enrolmentId)).state).toBe("pending-approval");
    const list = (await (await handle(api(cookie, "GET", "/api/dev/devices"), env, deps)).json()) as { enrolments: { udid: string; product: string }[] };
    expect(list.enrolments[0]).toMatchObject({ udid: UDID_1, product: "iPhone15,2" });
    expect((await handle(new Request(`${BASE}/api/enrol/${enrolmentId}`, { method: "POST", body: "garbage" }), env, deps)).status).toBe(400);
  });

  it("long polls until the deadline when nothing changes, returns at once otherwise", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const id = await enrol(env, deps, linkId, "Bob", UDID_1);
    let before = deps.now().getTime();
    expect((await status(env, deps, id, "pending-approval")).state).toBe("pending-approval");
    expect(deps.now().getTime() - before).toBeGreaterThanOrEqual(25_000);
    before = deps.now().getTime();
    await status(env, deps, id, "awaiting-device");
    expect(deps.now().getTime() - before).toBe(0);
  });

  it("can be rejected and removed by the owning developer only", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const id = await enrol(env, deps, linkId, "Bob", UDID_1);
    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    expect((await handle(api(other, "POST", `/api/dev/devices/${id}/reject`), env, deps)).status).toBe(404);
    expect((await handle(api(cookie, "POST", `/api/dev/devices/${id}/reject`), env, deps)).status).toBe(200);
    expect((await status(env, deps, id)).state).toBe("rejected");
    expect((await handle(api(cookie, "POST", `/api/dev/devices/${id}/reject`), env, deps)).status).toBe(409);
    expect((await handle(api(cookie, "DELETE", `/api/dev/devices/${id}`), env, deps)).status).toBe(200);
    expect((await handle(new Request(`${BASE}/api/enrol/${id}/status`), env, deps)).status).toBe(404);
  });
});

describe("approve, rebuild and build-ready", () => {
  it("registers the device, recreates the profile and dispatches a rebuild", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { appId, linkId, buildToken } = await createSkull(env, deps, cookie);
    const id = await enrol(env, deps, linkId, "Bob", UDID_1);
    const { fetch, calls } = fakeFetch({ ...githubRoutes(), ...appleRoutes({ devices: [], profileCount: 0 }) });
    const d = { ...deps, fetch };

    const res = await handle(api(cookie, "POST", `/api/dev/devices/${id}/approve`), env, d);
    expect(res.status).toBe(200);
    expect((await status(env, d, id)).state).toBe("building");

    const register = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/devices"))!;
    expect(JSON.parse(register.body!).data.attributes).toEqual({ name: "Bob (iPhone15,2)", udid: UDID_1, platform: "IOS" });
    expect(register.headers.get("Authorization")).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/v1/profiles"))!;
    const body = JSON.parse(create.body!);
    expect(body.data.attributes).toEqual({ name: "Skull Ad Hoc", profileType: "IOS_APP_ADHOC" });
    expect(body.data.relationships.devices.data).toEqual([{ type: "devices", id: "dev-1" }]);

    const dispatch = calls.find((c) => c.url.endsWith("/dispatches"))!;
    expect(dispatch.headers.get("Authorization")).toBe("Bearer ghp_dev");
    const payload = JSON.parse(dispatch.body!);
    expect(payload.event_type).toBe("my-store-rebuild");
    expect(payload.client_payload).toMatchObject({ app: appId, enrolmentId: id, udid: UDID_1, profileUuid: "uuid-1", buildReadyUrl: `${BASE}/api/build-ready`, profileUrl: `${BASE}/api/build/${appId}/profile` });

    const profile = await handle(api(null, "GET", `/api/build/${appId}/profile`, undefined, { Authorization: `Bearer ${buildToken}` }), env, d);
    expect(await profile.json()).toMatchObject({ profileName: "Skull Ad Hoc", uuid: "uuid-1", profileBase64: "b64-1" });
    const detail = (await (await handle(api(cookie, "GET", `/api/dev/apps/${appId}`), env, d)).json()) as { profile: { uuid: string; devices: number } };
    expect(detail.profile).toMatchObject({ uuid: "uuid-1", devices: 1 });
  });

  it("marks failed when Apple refuses", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { linkId } = await createSkull(env, deps, cookie);
    const id = await enrol(env, deps, linkId, "Bob", UDID_1);
    const routes = { ...githubRoutes(), ...appleRoutes({ devices: [], profileCount: 0 }) };
    routes["POST api.appstoreconnect.apple.com/v1/devices"] = () => new Response(JSON.stringify({ errors: [{ detail: "device limit reached" }] }), { status: 409 });
    const res = await handle(api(cookie, "POST", `/api/dev/devices/${id}/approve`), env, { ...deps, fetch: fakeFetch(routes).fetch });
    expect(res.status).toBe(502);
    const s = await status(env, deps, id);
    expect(s.state).toBe("failed");
    expect(s.message).toMatch(/device limit reached/);
  });

  it("refuses approval before the UDID arrived or without Apple secrets", async () => {
    const { linkId } = await createSkull(env, deps, cookie);
    const created = await handle(api(null, "POST", "/api/enrol/new", { linkId, name: "Bob" }), env, deps);
    const { enrolmentId } = (await created.json()) as { enrolmentId: string };
    expect((await handle(api(cookie, "POST", `/api/dev/devices/${enrolmentId}/approve`), env, deps)).status).toBe(409);
    const id = await enrol(env, deps, linkId, "Bob", UDID_1);
    const res = await handle(api(cookie, "POST", `/api/dev/devices/${id}/approve`), env, deps);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/App Store Connect API key/);
  });

  it("build-ready makes only the devices in that profile ready and re-dispatches for the rest", async () => {
    await saveAppleSecrets(env, deps, cookie);
    const { appId, linkId, buildToken } = await createSkull(env, deps, cookie);
    const { fetch, calls } = fakeFetch({ ...githubRoutes(), ...appleRoutes({ devices: [], profileCount: 0 }) });
    const d = { ...deps, fetch };
    const auth = { Authorization: `Bearer ${buildToken}` };

    const first = await enrol(env, d, linkId, "Bob", UDID_1);
    expect((await handle(api(cookie, "POST", `/api/dev/devices/${first}/approve`), env, d)).status).toBe(200);
    const second = await enrol(env, d, linkId, "Sue", UDID_2);
    expect((await handle(api(cookie, "POST", `/api/dev/devices/${second}/approve`), env, d)).status).toBe(200);
    expect(calls.filter((c) => c.url.endsWith("/dispatches")).length).toBe(2);

    // The CI built with the first profile, which only contained Bob's device.
    const res = await handle(api(null, "POST", "/api/build-ready", { app: appId, manifestUrl: "https://api.github.com/repos/o/skull/releases/assets/3", version: "0.1.1", profileUuid: "uuid-1" }, auth), env, d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: [first], waiting: [second], redispatched: true });
    expect(calls.filter((c) => c.url.endsWith("/dispatches")).length).toBe(3);

    const bob = await status(env, d, first);
    expect(bob.state).toBe("ready");
    expect(bob.manifestUrl).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(bob.message).toBe("version 0.1.1");
    expect((await status(env, d, second)).state).toBe("building");

    const res2 = await handle(api(null, "POST", "/api/build-ready", { app: appId, manifestUrl: "https://api.github.com/repos/o/skull/releases/assets/3", profileUuid: "uuid-2" }, auth), env, d);
    expect(await res2.json()).toEqual({ ready: [second], waiting: [], redispatched: false });
  });

  it("build-ready validates its input and token", async () => {
    const { appId, buildToken } = await createSkull(env, deps, cookie);
    const auth = { Authorization: `Bearer ${buildToken}` };
    expect((await handle(api(null, "POST", "/api/build-ready", { app: appId }), env, deps)).status).toBe(401);
    expect((await handle(api(null, "POST", "/api/build-ready", { app: "nope" }, auth), env, deps)).status).toBe(404);
    expect((await handle(api(null, "POST", "/api/build-ready", { app: appId }, auth), env, deps)).status).toBe(400);
    expect((await handle(api(null, "POST", "/api/build-ready", { app: appId, manifestUrl: "https://x", profileUuid: "nope" }, auth), env, deps)).status).toBe(409);
  });
});
