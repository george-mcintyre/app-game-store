// GitHub OAuth sign-in and cookie sessions for developers.
import { randomId } from "./crypto.js";
import { Db, type Developer } from "./db.js";
import type { Deps, Env } from "./env.js";
import { HttpError } from "./http.js";

export const SESSION_COOKIE = "oa_session";
const STATE_COOKIE = "oa_state";
const SESSION_DAYS = 30;

// Paths a developer slug may not take.
export const RESERVED_SLUGS = new Set(["api", "dl", "dev", "l", "assets", "robots.txt", "favicon.ico", "index.html"]);

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
    headers: { Location: `${env.GITHUB_OAUTH_BASE}/login/oauth/authorize?${params}`, "Set-Cookie": cookie(STATE_COOKIE, state, 600, isSecure(env)) },
  });
}

// Step 2: swap the code for a token, read the GitHub user, create or find the developer.
export async function finishLogin(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (!oauthConfigured(env)) throw new HttpError(503, "GitHub sign-in is not configured");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || parseCookies(request)[STATE_COOKIE] !== state) throw new HttpError(400, "sign-in state mismatch; try again");

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
    dev = { id: randomId(8), githubId: user.id, githubLogin: user.login, slug: await freeSlug(db, user.login), displayName: user.name?.trim() || user.login, createdAt: now.toISOString() };
    await db.insertDeveloper(dev);
  }
  const sessionId = randomId(24);
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insertSession(sessionId, dev.id, expires.toISOString());
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.PUBLIC_ORIGIN}/dev`,
      "Set-Cookie": cookie(SESSION_COOKIE, sessionId, SESSION_DAYS * 86_400, isSecure(env)),
    },
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const id = parseCookies(request)[SESSION_COOKIE];
  if (id) await Db.from(env).deleteSession(id);
  return new Response(null, { status: 302, headers: { Location: `${env.PUBLIC_ORIGIN}/`, "Set-Cookie": cookie(SESSION_COOKIE, "", 0, isSecure(env)) } });
}

export async function currentDeveloper(request: Request, env: Env, deps: Deps): Promise<Developer | null> {
  const id = parseCookies(request)[SESSION_COOKIE];
  if (!id) return null;
  return Db.from(env).sessionDeveloper(id, deps.now().toISOString());
}

export async function requireDeveloper(request: Request, env: Env, deps: Deps): Promise<Developer> {
  const dev = await currentDeveloper(request, env, deps);
  if (!dev) throw new HttpError(401, "sign in first");
  return dev;
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
