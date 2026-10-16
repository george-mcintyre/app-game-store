import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { BASE, api, clearDb, fakeFetch, oauthRoutes, signIn, testDeps, testEnv } from "./helpers.js";

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
    expect(res.headers.get("Set-Cookie")).toMatch(/^oa_state=[0-9a-f]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it("creates the developer on first sign-in and reuses it after", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect(cookie).toMatch(/^oa_session=[0-9a-f]{48}$/);
    const me = await handle(api(cookie, "GET", "/api/dev/me"), env, deps);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { developer: { slug: string; displayName: string; githubLogin: string }; secrets: { apple: boolean; github: boolean } };
    expect(body.developer).toMatchObject({ slug: "george", displayName: "George", githubLogin: "george" });
    expect(body.secrets).toEqual({ apple: false, appleSavedAt: null, appleTeamId: "", appleTeamIdSavedAt: null, github: false, githubSavedAt: null });

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
    const res = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=zzz`, { headers: { Cookie: "oa_state=other" } }), env, testDeps(fakeFetch(oauthRoutes()).fetch));
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

  it("stores secrets encrypted and never returns them", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const bad = await handle(api(cookie, "PUT", "/api/dev/secrets", { applePrivateKey: "not a key" }), env, deps);
    expect(bad.status).toBe(400);
    const res = await handle(api(cookie, "PUT", "/api/dev/secrets", { appleIssuerId: "iss", appleKeyId: "kid", applePrivateKey: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----", githubToken: "ghp_x" }), env, deps);
    const saved = "2026-10-16T10:00:00.000Z";
    expect(await res.json()).toEqual({ secrets: { apple: true, appleSavedAt: saved, appleTeamId: "", appleTeamIdSavedAt: null, github: true, githubSavedAt: saved } });
    const row = await env.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>();
    expect(row!.blob).not.toContain("ghp_x");
    expect(row!.blob).not.toContain("iss");
    const cleared = await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "-", appleTeamId: "TEAM" }), env, deps);
    expect(await cleared.json()).toEqual({ secrets: { apple: true, appleSavedAt: saved, appleTeamId: "TEAM", appleTeamIdSavedAt: saved, github: false, githubSavedAt: null } });
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
