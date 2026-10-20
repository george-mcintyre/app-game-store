import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { TERMS_VERSION } from "@my/store-shared";
import { BASE, GH_TOKEN, api, applePem, clearDb, fakeFetch, oauthRoutes, signIn, testDeps, testEnv } from "./helpers.js";

let env: Env;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
});

describe("GitHub sign-in", () => {
  it("redirects to GitHub with a state cookie", async () => {
    const res = await handle(new Request(`${BASE}/api/auth/github`), env);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("Location")!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("test-client-id");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback`);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-oa_state=[0-9a-f]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it("creates the developer on first sign-in and reuses it after", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect(cookie).toMatch(/^__Host-oa_session=[0-9a-f]{48}$/);
    const me = await handle(api(cookie, "GET", "/api/dev/me"), env, deps);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { developer: { slug: string; displayName: string; githubLogin: string }; secrets: { apple: boolean; github: boolean } };
    expect(body.developer).toMatchObject({ slug: "george", displayName: "George", githubLogin: "george" });
    expect(body.secrets).toEqual({ apple: false, appleSavedAt: null, appleTeamId: "", appleTeamIdSavedAt: null, github: false, githubSavedAt: null, signing: null });

    const again = await signIn(env, deps);
    const me2 = (await (await handle(api(again, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { id: string } };
    expect(me2.developer.id).toBe((body.developer as { id?: string }).id);
  });

  it("avoids reserved and taken slugs", async () => {
    const deps = testDeps();
    const a = await signIn(env, deps, { id: 1, login: "dev", name: "Dev" });
    const b = await signIn(env, deps, { id: 2, login: "dev", name: "Other" });
    const sa = (await (await handle(api(a, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { slug: string } };
    const sb = (await (await handle(api(b, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { slug: string } };
    expect(sa.developer.slug).toBe("dev-2");
    expect(sb.developer.slug).toBe("dev-3");
  });

  it("rejects a callback with a wrong state", async () => {
    const res = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=zzz`, { headers: { Cookie: "__Host-oa_state=other" } }), env, testDeps(fakeFetch(oauthRoutes()).fetch));
    expect(res.status).toBe(400);
  });

  it("requires a session for /api/dev and ends it on logout", async () => {
    const deps = testDeps();
    expect((await handle(api(null, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const cookie = await signIn(env, deps);
    const out = await handle(api(cookie, "POST", "/api/auth/logout"), env, deps);
    expect(out.status).toBe(302);
    expect(out.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });

  it("expires sessions after 30 days", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    deps.advance(31 * 86_400_000);
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });

  it("reports health without secrets", async () => {
    const res = await handle(new Request(`${BASE}/api/health`), env);
    expect(await res.json()).toEqual({ ok: true, oauth: true, links: true, secrets: true });
  });
});

describe("terms", () => {
  it("blocks the console until the current terms are accepted, but not /me or API keys", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps, undefined, false);
    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { termsVersion: string; developer: { termsAcceptedVersion: string | null } };
    expect(me.termsVersion).toBe(TERMS_VERSION);
    expect(me.developer.termsAcceptedVersion).toBeNull();
    const blocked = await handle(api(cookie, "GET", "/api/dev/apps"), env, deps);
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/accept the terms/);
    expect((await handle(api(cookie, "POST", "/api/dev/terms", { version: "1999-01-01" }), env, deps)).status).toBe(400);
    const ok = await handle(api(cookie, "POST", "/api/dev/terms", { version: TERMS_VERSION }), env, deps);
    expect(((await ok.json()) as { termsAcceptedAt: string }).termsAcceptedAt).toBe("2026-10-16T10:00:00.000Z");
    expect((await handle(api(cookie, "GET", "/api/dev/apps"), env, deps)).status).toBe(200);
    const again = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { termsAcceptedVersion: string } };
    expect(again.developer.termsAcceptedVersion).toBe(TERMS_VERSION);
    const log = (await (await handle(api(cookie, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string }[] };
    expect(log.events[0].event).toBe("terms-accepted");
  });

  it("deletes the account and everything under it", async () => {
    const deps = testDeps(fakeFetch(oauthRoutes()).fetch);
    const cookie = await signIn(env, deps);
    await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps);
    const { app } = (await (await handle(api(cookie, "POST", "/api/dev/apps", { name: "X", repo: "o/x" }), env, deps)).json()) as { app: { id: string } };
    await handle(api(cookie, "POST", `/api/dev/apps/${app.id}/links`, { label: "l" }), env, deps);
    await handle(api(cookie, "POST", "/api/dev/keys", { name: "k" }), env, deps);
    expect((await handle(api(cookie, "DELETE", "/api/dev/me", { confirm: "wrong" }), env, deps)).status).toBe(400);
    const gone = await handle(api(cookie, "DELETE", "/api/dev/me", { confirm: "george" }), env, deps);
    expect(gone.status).toBe(200);
    expect(gone.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    for (const table of ["developers", "developer_secrets", "sessions", "api_keys", "apps", "links", "audit_log"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row!.n, table).toBe(0);
    }
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });
});

describe("account settings", () => {
  it("updates slug and display name with validation", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect((await handle(api(cookie, "PUT", "/api/dev/me", { slug: "API", displayName: "G" }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "PUT", "/api/dev/me", { slug: "geo", displayName: " " }), env, deps)).status).toBe(400);
    const ok = await handle(api(cookie, "PUT", "/api/dev/me", { slug: "George Mc", displayName: "George M" }), env, deps);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { developer: { slug: string } }).developer.slug).toBe("george-mc");
    const other = await signIn(env, deps, { id: 7, login: "sue", name: "Sue" });
    expect((await handle(api(other, "PUT", "/api/dev/me", { slug: "george-mc", displayName: "Sue" }), env, deps)).status).toBe(409);
  });

  it("stores secrets encrypted field by field and never returns them", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { applePrivateKey: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "not-a-token" }), env, deps)).status).toBe(400);
    const pem = await applePem();
    const res = await handle(api(cookie, "PUT", "/api/dev/secrets", { appleIssuerId: "iss", appleKeyId: "kid", applePrivateKey: pem, githubToken: GH_TOKEN }), env, deps);
    const saved = "2026-10-16T10:00:00.000Z";
    expect(await res.json()).toEqual({ secrets: { apple: true, appleSavedAt: saved, appleTeamId: "", appleTeamIdSavedAt: null, github: true, githubSavedAt: saved, signing: null } });

    const row = await env.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>();
    const envelope = JSON.parse(row!.blob) as { v: number; kid: string; fields: Record<string, { iv: string; ct: string }>; savedAt: Record<string, string> };
    expect(envelope.v).toBe(2);
    expect(envelope.kid).toMatch(/^[0-9a-f]{12}$/);
    expect(Object.keys(envelope.fields).sort()).toEqual(["appleIssuerId", "appleKeyId", "applePrivateKey", "githubToken"]);
    expect(row!.blob).not.toContain(GH_TOKEN);
    expect(row!.blob).not.toContain("iss");
    expect(row!.blob).not.toContain(pem.split("\n")[1]);

    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { appleTeamId: "set" }), env, deps)).status).toBe(400);
    const cleared = await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "-", appleTeamId: "ABCDE12345" }), env, deps);
    expect(await cleared.json()).toEqual({ secrets: { apple: true, appleSavedAt: saved, appleTeamId: "ABCDE12345", appleTeamIdSavedAt: saved, github: false, githubSavedAt: null, signing: null } });

    // Sending the same team ID again neither moves its date nor logs a save.
    deps.advance(60_000);
    const again = (await (await handle(api(cookie, "PUT", "/api/dev/secrets", { appleTeamId: "ABCDE12345" }), env, deps)).json()) as { secrets: { appleTeamIdSavedAt: string } };
    expect(again.secrets.appleTeamIdSavedAt).toBe(saved);
    const events = (await (await handle(api(cookie, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string; detail: string }[] };
    expect(events.events.filter((e) => e.event === "credentials-saved" && e.detail.includes("appleTeamId"))).toHaveLength(1);

    // The settings form pre-fills the team ID from here, so it must be the value, not a presence marker.
    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { secrets: { apple: boolean; github: boolean; appleTeamId: string } };
    expect(me.secrets).toMatchObject({ apple: true, github: false, appleTeamId: "ABCDE12345" });
  });

  it("refuses credential changes through an API key", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const { key } = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "k" }), env, deps)).json()) as { key: string };
    const res = await handle(api(null, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }, { Authorization: `Bearer ${key}` }), env, deps);
    expect(res.status).toBe(403);
  });

  it("reads a legacy whole-blob credential record and rewraps it", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const { developer } = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { id: string } };
    // Format 1: AES-GCM over the whole JSON with the old derivation.
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(env.MASTER_KEY!), "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(developer.id), info: enc.encode("ourapps-developer-secrets") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify({ githubToken: GH_TOKEN, savedAt: { githubToken: "2026-01-01T00:00:00.000Z" } }))));
    const bytes = new Uint8Array(iv.length + ct.length);
    bytes.set(iv);
    bytes.set(ct, iv.length);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    await env.DB.prepare("INSERT INTO developer_secrets (developer_id, blob, updated_at) VALUES (?, ?, ?) ON CONFLICT(developer_id) DO UPDATE SET blob = excluded.blob").bind(developer.id, btoa(s), "x").run();

    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { secrets: { github: boolean; githubSavedAt: string } };
    expect(me.secrets).toMatchObject({ github: true, githubSavedAt: "2026-01-01T00:00:00.000Z" });
    const row = await env.DB.prepare("SELECT blob FROM developer_secrets WHERE developer_id = ?").bind(developer.id).first<{ blob: string }>();
    expect(row!.blob.startsWith("{")).toBe(true);
    expect(row!.blob).not.toContain(GH_TOKEN);
  });

  it("rewraps credentials sealed under MASTER_KEY_PREVIOUS", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const pem = await applePem();
    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { appleIssuerId: "iss", appleKeyId: "kid", applePrivateKey: pem, githubToken: GH_TOKEN }), env, deps)).status).toBe(200);
    const before = (await env.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>())!.blob;
    const rotated = testEnv({ MASTER_KEY: "brand-new-master-key", MASTER_KEY_PREVIOUS: env.MASTER_KEY });
    // The session itself survives rotation (hash under the previous key, rewritten on use).
    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), rotated, deps)).json()) as { secrets: { apple: boolean; github: boolean } };
    expect(me.secrets).toMatchObject({ apple: true, github: true });
    // Any decrypting read rewraps the blob under the new key.
    expect((await handle(api(cookie, "GET", "/api/dev/apps"), rotated, deps)).status).toBe(200);
    const after = (await rotated.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>())!.blob;
    expect(after).not.toBe(before);
    expect(JSON.parse(after).kid).not.toBe(JSON.parse(before).kid);
    const noPrevious = testEnv({ MASTER_KEY: "brand-new-master-key" });
    const again = (await (await handle(api(cookie, "GET", "/api/dev/me"), noPrevious, deps)).json()) as { secrets: { apple: boolean } };
    expect(again.secrets.apple).toBe(true);
    expect((await handle(api(cookie, "GET", "/api/dev/apps"), noPrevious, deps)).status).toBe(200);
  });

  it("hashes session ids in the database and upgrades legacy rows", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const raw = cookie.split("=")[1];
    const rows = await env.DB.prepare("SELECT id FROM sessions").all<{ id: string }>();
    expect(rows.results.map((r) => r.id)).not.toContain(raw);
    expect(rows.results[0].id.startsWith("h2:")).toBe(true);

    await env.DB.prepare("INSERT INTO sessions (id, developer_id, expires_at) VALUES (?, (SELECT id FROM developers LIMIT 1), ?)").bind("legacyraw", "2030-01-01T00:00:00Z").run();
    expect((await handle(api("__Host-oa_session=legacyraw", "GET", "/api/dev/me"), env, deps)).status).toBe(200);
    const upgraded = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?").bind("legacyraw").first();
    expect(upgraded).toBeNull();
    expect((await handle(api("__Host-oa_session=legacyraw", "GET", "/api/dev/me"), env, deps)).status).toBe(200);
  });

  it("ignores session and state cookies without the __Host- prefix", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const id = cookie.split("=")[1];
    // A subdomain can toss "oa_session=..." with Domain=ourapps.app; it must not authenticate.
    expect((await handle(api(`oa_session=${id}`, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const start = await handle(new Request(`${BASE}/api/auth/github`), env, deps);
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const tossed = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: `oa_state=${state}` } }), env, testDeps(fakeFetch(oauthRoutes()).fetch));
    expect(tossed.status).toBe(400);
  });

  it("signs out everywhere and records security events", async () => {
    const deps = testDeps();
    const a = await signIn(env, deps);
    const b = await signIn(env, deps);
    const out = await handle(api(a, "POST", "/api/auth/logout-everywhere"), env, deps);
    expect(await out.json()).toEqual({ ok: true, sessions: 2 });
    expect((await handle(api(b, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const c = await signIn(env, deps);
    const log = (await (await handle(api(c, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string; detail: string }[] };
    expect(log.events.map((e) => e.event)).toEqual(["terms-accepted", "sign-in", "sign-out-everywhere", "terms-accepted", "sign-in", "terms-accepted", "sign-in"]);
    expect(log.events[2].detail).toBe("2 sessions");
  });
});

describe("response hygiene", () => {
  it("adds security headers to every response", async () => {
    const res = await handle(new Request(`${BASE}/api/health`), env);
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=31536000/);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const err = await handle(new Request(`${BASE}/api/nope`), env);
    expect(err.status).toBe(404);
    expect(err.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("serves the Search Console verification file only when configured", async () => {
    const unset = await handle(new Request(`${BASE}/google1234.html`), env);
    expect(await unset.text()).not.toContain("google-site-verification");
    const res = await handle(new Request(`${BASE}/google1234.html`), testEnv({ GOOGLE_SITE_VERIFICATION: "google1234.html" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("google-site-verification: google1234.html");
  });
});
