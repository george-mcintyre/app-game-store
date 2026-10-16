import { env as bindings } from "cloudflare:workers";
import { expect } from "vitest";
import type { Deps, Env } from "../src/env.js";
import { handle } from "../src/index.js";

export const BASE = "https://ourapps.app";

export const manifest = {
  schema: 1,
  id: "skull",
  name: "Skull",
  version: "0.1.0",
  description: "Bluffing card game.",
  icon: "https://api.github.com/repos/o/skull/releases/assets/5",
  minPlayers: 3,
  maxPlayers: 6,
  install: {
    pwa: null,
    android: { apk: "https://api.github.com/repos/o/skull/releases/assets/2" },
    ios: { bundleId: "com.example.skull", adhoc: "https://api.github.com/repos/o/skull/releases/assets/3", testflight: null },
  },
};

export const manifestPlist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>https://api.github.com/repos/o/skull/releases/assets/4</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>com.example.skull</string><key>kind</key><string>software</string><key>title</key><string>Skull</string></dict>
</dict></array></dict></plist>`;

export type Call = { method: string; url: string; body?: string; headers: Headers };

// A fetch stub keyed by "METHOD host/path"; records every call.
export function fakeFetch(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const call: Call = { method: req.method, url: req.url, body: req.method === "GET" ? undefined : await req.text(), headers: req.headers };
    calls.push(call);
    const key = `${req.method} ${u.host}${u.pathname}`;
    const handler = routes[key];
    if (!handler) return new Response(`no stub for ${key}`, { status: 599 });
    return handler(call);
  };
  return { fetch: fetchStub, calls };
}

export type TestDeps = Deps & { advance: (ms: number) => void };

export function testDeps(fetchStub: typeof fetch = () => Promise.resolve(new Response("no fetch", { status: 599 }))): TestDeps {
  let t = Date.parse("2026-10-16T10:00:00Z");
  return {
    fetch: fetchStub,
    now: () => new Date(t),
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export async function applePem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  let s = "";
  for (const b of der) s += String.fromCharCode(b);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(s)}\n-----END PRIVATE KEY-----\n`;
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(bindings as unknown as Env), ...overrides };
}

export async function clearDb(env: Env): Promise<void> {
  for (const table of ["profiles", "enrolments", "links", "apps", "sessions", "developer_secrets", "developers"]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
}

export const gh = (path: string) => `api.github.com${path}`;
export const apple = (path: string) => `api.appstoreconnect.apple.com${path}`;

export const jsonRes = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Routes that let a GitHub sign-in complete for one user.
export function oauthRoutes(user = { id: 42, login: "george", name: "George" }) {
  return {
    "POST github.com/login/oauth/access_token": () => jsonRes({ access_token: "gho_test" }),
    [`GET ${gh("/user")}`]: () => jsonRes(user),
  };
}

// Routes that make GitHub serve the test manifest and artefacts.
export function githubRoutes() {
  return {
    [`GET ${gh("/repos/o/skull/releases/latest")}`]: () => jsonRes({ assets: [{ name: "my-app.json", url: "https://api.github.com/repos/o/skull/releases/assets/1" }] }),
    [`GET ${gh("/repos/o/skull/releases/assets/1")}`]: () => jsonRes(manifest),
    [`GET ${gh("/repos/o/skull/releases/assets/2")}`]: () => new Response("APKBYTES", { status: 200 }),
    [`GET ${gh("/repos/o/skull/releases/assets/3")}`]: () => new Response(manifestPlist, { status: 200 }),
    [`GET ${gh("/repos/o/skull/releases/assets/4")}`]: () => new Response("IPABYTES", { status: 200 }),
    [`GET ${gh("/repos/o/skull/releases/assets/5")}`]: () => new Response("PNGBYTES", { status: 200, headers: { "Content-Type": "image/png" } }),
    [`POST ${gh("/repos/o/skull/dispatches")}`]: () => new Response(null, { status: 204 }),
  };
}

// Routes that make Apple accept new devices and recreate one profile.
export function appleRoutes(state: { devices: { id: string; udid: string }[]; profileCount: number }) {
  return {
    [`GET ${apple("/v1/devices")}`]: (call: Call) => {
      const udid = new URL(call.url).searchParams.get("filter[udid]");
      const data = (udid ? state.devices.filter((d) => d.udid === udid) : state.devices).map((d) => ({ id: d.id, type: "devices", attributes: { udid: d.udid } }));
      return jsonRes({ data });
    },
    [`POST ${apple("/v1/devices")}`]: (call: Call) => {
      const body = JSON.parse(call.body!);
      const device = { id: `dev-${state.devices.length + 1}`, udid: body.data.attributes.udid };
      state.devices.push(device);
      return jsonRes({ data: { id: device.id, type: "devices", attributes: body.data.attributes } }, 201);
    },
    [`GET ${apple("/v1/profiles")}`]: () =>
      jsonRes({
        data: [
          {
            id: "prof-old",
            type: "profiles",
            attributes: { name: "Skull Ad Hoc", uuid: "uuid-old", profileContent: "b64old", expirationDate: "2027-01-01T00:00:00Z" },
            relationships: { bundleId: { data: [{ type: "bundleIds", id: "bid-1" }] }, certificates: { data: [{ type: "certificates", id: "cert-1" }] } },
          },
        ],
      }),
    [`DELETE ${apple("/v1/profiles/prof-old")}`]: () => new Response(null, { status: 204 }),
    [`POST ${apple("/v1/profiles")}`]: () => {
      state.profileCount += 1;
      const n = state.profileCount;
      return jsonRes({ data: { id: `prof-${n}`, type: "profiles", attributes: { uuid: `uuid-${n}`, profileContent: `b64-${n}`, expirationDate: "2027-10-01T00:00:00Z" } } }, 201);
    },
  };
}

export const deviceReply = (udid: string) =>
  new TextEncoder().encode(
    `\x30\x82\x01\x00binary-junk<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>PRODUCT</key><string>iPhone15,2</string><key>UDID</key><string>${udid}</string><key>VERSION</key><string>22B83</string></dict></plist>more-junk`,
  );

// Sign in through the stubbed OAuth flow; returns the Cookie header to use.
export async function signIn(env: Env, deps: TestDeps, user?: { id: number; login: string; name: string }): Promise<string> {
  const stub = fakeFetch(oauthRoutes(user));
  const start = await handle(new Request(`${BASE}/api/auth/github`), env, deps);
  expect(start.status).toBe(302);
  const stateCookie = start.headers.get("Set-Cookie")!.split(";")[0];
  const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
  const done = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: stateCookie } }), env, { ...deps, fetch: stub.fetch });
  expect(done.status).toBe(302);
  expect(done.headers.get("Location")).toBe(`${BASE}/dev`);
  return done.headers.get("Set-Cookie")!.split(";")[0];
}

export function api(cookie: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { ...extra };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

export async function createSkull(env: Env, deps: TestDeps, cookie: string): Promise<{ appId: string; buildToken: string; linkId: string }> {
  const res = await handle(api(cookie, "POST", "/api/dev/apps", { name: "Skull", repo: "o/skull", profileName: "Skull Ad Hoc", tagline: "Bluff your friends" }), env, deps);
  expect(res.status).toBe(201);
  const { app, buildToken } = (await res.json()) as { app: { id: string }; buildToken: string };
  const linkRes = await handle(api(cookie, "POST", `/api/dev/apps/${app.id}/links`, { label: "family" }), env, deps);
  expect(linkRes.status).toBe(201);
  const { link } = (await linkRes.json()) as { link: { id: string } };
  return { appId: app.id, buildToken, linkId: link.id };
}

export async function saveAppleSecrets(env: Env, deps: TestDeps, cookie: string): Promise<void> {
  const res = await handle(api(cookie, "PUT", "/api/dev/secrets", { appleIssuerId: "iss", appleKeyId: "kid", applePrivateKey: await applePem(), appleTeamId: "TEAM1", githubToken: "ghp_dev" }), env, deps);
  expect(res.status).toBe(200);
}

export async function enrol(env: Env, deps: TestDeps, linkId: string, name: string, udid: string): Promise<string> {
  const created = await handle(api(null, "POST", "/api/enrol/new", { linkId, name }), env, deps);
  expect(created.status).toBe(201);
  const { enrolmentId } = (await created.json()) as { enrolmentId: string };
  const cb = await handle(new Request(`${BASE}/api/enrol/${enrolmentId}`, { method: "POST", body: deviceReply(udid) }), env, deps);
  expect(cb.status).toBe(301);
  return enrolmentId;
}

export async function status(env: Env, deps: TestDeps, id: string, since?: string) {
  const res = await handle(new Request(`${BASE}/api/enrol/${id}/status${since ? `?since=${since}` : ""}`), env, deps);
  expect(res.status).toBe(200);
  return (await res.json()) as { state: string; manifestUrl?: string; message?: string };
}
