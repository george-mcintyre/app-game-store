// GitHub OAuth sign-in, cookie sessions and API keys for developers.
import { audit } from "./audit.js";
import { hashMatches, randomId, tokenHash, tokenHashCandidates, type MasterKeys } from "./crypto.js";
import { Db, type Developer, type KeyScope } from "./db.js";
import type { Deps, Env } from "./env.js";
import { HttpError, bearer } from "./http.js";

export const API_KEY_PREFIX = "oa_";

// "__Host-" cookies cannot be set by a subdomain or with a Domain attribute, so a web app served
// on <linkId>.ourapps.app cannot plant a session or sign-in state cookie for the console.
// Plain names only for http://localhost development, where Safari refuses Secure cookies.
export function sessionCookieName(env: Env): string {
  return isSecure(env) ? "__Host-oa_session" : "oa_session";
}

function stateCookieName(env: Env): string {
  return isSecure(env) ? "__Host-oa_state" : "oa_state";
}
const SESSION_DAYS = 30;

// Paths a developer slug may not take.
export const RESERVED_SLUGS = new Set(["api", "dl", "dev", "l", "example", "terms", "reference", "small", "free-tiers.md", "assets", "robots.txt", "favicon.ico", "favicon.svg", "index.html", "agents.md", "contract.md", "llms.txt"]);

export function parseCookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function isSecure(env: Env): boolean {
  return env.PUBLIC_ORIGIN.startsWith("https://");
}

export function oauthConfigured(env: Env): boolean {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function masterKeys(env: Env): MasterKeys {
  return { current: env.MASTER_KEY, previous: env.MASTER_KEY_PREVIOUS || null };
}

// The database holds only a keyed hash of the session id; the cookie holds the id itself.
function sessionHash(env: Env, id: string): Promise<string> {
  return tokenHash(masterKeys(env), "session", id);
}

// Step 1: send the browser to GitHub with a state cookie.
export function startLogin(env: Env): Response {
  if (!oauthConfigured(env)) throw new HttpError(503, "GitHub sign-in is not configured");
  const state = randomId(16);
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: `${env.PUBLIC_ORIGIN}/api/auth/callback`,
    scope: "read:user",
    state,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.GITHUB_OAUTH_BASE}/login/oauth/authorize?${params}`, "Set-Cookie": cookie(stateCookieName(env), state, 600, isSecure(env)) },
  });
}

// Step 2: swap the code for a token, read the GitHub user, create or find the developer.
export async function finishLogin(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "GitHub sign-in is not configured");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || parseCookies(request)[stateCookieName(env)] !== state) throw new HttpError(400, "sign-in state mismatch; try again");

  const tokenRes = await deps.fetch(`${env.GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "ourapps" },
    body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: `${env.PUBLIC_ORIGIN}/api/auth/callback` }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) throw new HttpError(502, "GitHub did not return a token");

  const userRes = await deps.fetch(`${env.GITHUB_API_BASE}/user`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ourapps" } });
  if (!userRes.ok) throw new HttpError(502, `GitHub user lookup failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id: number; login: string; name?: string | null };

  const db = Db.from(env);
  const now = deps.now();
  let dev = await db.developerByGithubId(user.id);
  if (!dev) {
    dev = { id: randomId(8), githubId: user.id, githubLogin: user.login, slug: await freeSlug(db, user.login), displayName: user.name?.trim() || user.login, createdAt: now.toISOString(), termsAcceptedVersion: null, termsAcceptedAt: null };
    await db.insertDeveloper(dev);
  }
  const sessionId = randomId(24);
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insertSession(await sessionHash(env, sessionId), dev.id, expires.toISOString());
  await db.deleteExpiredSessions(now.toISOString());
  await audit(request, env, deps, dev.id, "sign-in", `GitHub @${user.login}`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.PUBLIC_ORIGIN}/dev`,
      "Set-Cookie": cookie(sessionCookieName(env), sessionId, SESSION_DAYS * 86_400, isSecure(env)),
    },
  });
}

export async function logout(request: Request, env: Env, deps: Deps): Promise<Response> {
  const id = parseCookies(request)[sessionCookieName(env)];
  if (id) {
    const dev = await lookupSession(env, id, deps.now().toISOString());
    await Db.from(env).deleteSession(await sessionHash(env, id));
    if (dev) await audit(request, env, deps, dev.id, "sign-out");
  }
  return new Response(null, { status: 302, headers: { Location: `${env.PUBLIC_ORIGIN}/`, "Set-Cookie": cookie(sessionCookieName(env), "", 0, isSecure(env)) } });
}

// Ends every session of the developer, including this one.
export async function logoutEverywhere(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const count = await Db.from(env).deleteSessionsFor(dev.id);
  await audit(request, env, deps, dev.id, "sign-out-everywhere", `${count} session${count === 1 ? "" : "s"}`);
  return new Response(JSON.stringify({ ok: true, sessions: count }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie(sessionCookieName(env), "", 0, isSecure(env)) },
  });
}

// Finds a session by hashed id; rows under the previous master key, plain SHA-256 or the raw
// id (written before hashing) are rewritten under the current key.
async function lookupSession(env: Env, id: string, now: string): Promise<Developer | null> {
  const db = Db.from(env);
  const candidates = [...(await tokenHashCandidates(masterKeys(env), "session", id)), id];
  for (let i = 0; i < candidates.length; i++) {
    const dev = await db.sessionDeveloper(candidates[i], now);
    if (!dev) continue;
    if (i > 0) await db.renameSession(candidates[i], candidates[0]);
    return dev;
  }
  return null;
}

export type AuthVia = "session" | "key";
export interface AuthedDeveloper extends Developer {
  authVia: AuthVia;
  scope: KeyScope;
  keyId?: string;
}

export function newApiKey(): string {
  return API_KEY_PREFIX + randomId(20);
}

export function apiKeyHash(env: Env, key: string): Promise<string> {
  return tokenHash(masterKeys(env), "api-key", key);
}

// A developer is identified by the session cookie or by an API key in the Authorization header.
export async function currentDeveloper(request: Request, env: Env, deps: Deps): Promise<AuthedDeveloper | null> {
  const db = Db.from(env);
  const now = deps.now();
  const token = bearer(request);
  if (token !== null) {
    if (!token.startsWith(API_KEY_PREFIX)) return null;
    const key = await db.apiKeyByHash(await tokenHashCandidates(masterKeys(env), "api-key", token));
    if (!key) return null;
    const match = await hashMatches(masterKeys(env), "api-key", token, key.keyHash);
    if (!match.ok) return null;
    if (key.expiresAt && Date.parse(key.expiresAt) <= now.getTime()) return null;
    const dev = await db.developerById(key.developerId);
    if (!dev) return null;
    if (match.rewrite) await db.rehashApiKey(key.id, await apiKeyHash(env, token));
    if (!key.lastUsedAt || now.getTime() - Date.parse(key.lastUsedAt) > 10 * 60_000) await db.touchApiKey(key.id, now.toISOString());
    return { ...dev, authVia: "key", scope: key.scope, keyId: key.id };
  }
  const id = parseCookies(request)[sessionCookieName(env)];
  if (!id) return null;
  const dev = await lookupSession(env, id, now.toISOString());
  return dev ? { ...dev, authVia: "session", scope: "manage" } : null;
}

export async function requireDeveloper(request: Request, env: Env, deps: Deps): Promise<AuthedDeveloper> {
  const dev = await currentDeveloper(request, env, deps);
  if (!dev) throw new HttpError(401, "sign in, or send an API key as Authorization: Bearer oa_...");
  const reading = ["GET", "HEAD", "OPTIONS"].includes(request.method);
  // Cookie sessions only accept writes from this site; API keys are not sent by browsers across sites.
  if (dev.authVia === "session" && !reading) {
    const origin = request.headers.get("Origin");
    const local = env.PUBLIC_ORIGIN.startsWith("http://localhost") && origin !== null && /^http:\/\/localhost(:\d+)?$/.test(origin);
    if (origin !== null && origin !== env.PUBLIC_ORIGIN && !local) throw new HttpError(403, "cross-site request refused");
  }
  if (dev.authVia === "key" && dev.scope === "read" && !reading) throw new HttpError(403, "this API key is read-only");
  return dev;
}

export function requireSession(dev: AuthedDeveloper): void {
  if (dev.authVia !== "session") throw new HttpError(403, "this action needs the dashboard, not an API key");
}

// Browser sessions must have accepted the current terms; API keys were created after acceptance.
export function requireTerms(dev: AuthedDeveloper, version: string): void {
  if (dev.authVia === "session" && dev.termsAcceptedVersion !== version) throw new HttpError(403, "accept the terms to continue");
}

export function normaliseSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function freeSlug(db: Db, login: string): Promise<string> {
  const base = normaliseSlug(login) || "dev";
  let slug = base;
  for (let n = 2; RESERVED_SLUGS.has(slug) || (await db.developerBySlug(slug)); n++) slug = `${base}-${n}`;
  return slug;
}

export function clearSessionCookie(env: Env): string {
  return cookie(sessionCookieName(env), "", 0, isSecure(env));
}
