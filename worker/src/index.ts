import { finishLogin, logout, oauthConfigured, requireDeveloper, startLogin } from "./auth.js";
import { defaultDeps, type Deps, type Env } from "./env.js";
import { HttpError, json } from "./http.js";
import { buildProfile, buildReady } from "./routes/build.js";
import * as dev from "./routes/dev.js";
import { enrolCallback, enrolNew, enrolProfile, enrolStatus } from "./routes/enrol.js";
import { devPage, linkPage, serveArtefact } from "./routes/public.js";

// Sent on every response so browsers and scanners see a locked-down site.
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

export async function handle(request: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  let res: Response;
  try {
    res = await route(request, env, deps);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "unknown error";
    if (status >= 500) console.error(message);
    res = json({ error: message }, status);
  }
  res = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  return res;
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const m = request.method;

  if (parts[0] === "dl" && parts.length === 2 && m === "GET") return serveArtefact(env, deps, parts[1]);
  if (parts[0] !== "api") {
    const verification = env.GOOGLE_SITE_VERIFICATION;
    if (verification && parts.length === 1 && parts[0] === verification && m === "GET") {
      return new Response(`google-site-verification: ${verification}`, { headers: { "Content-Type": "text/html" } });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    throw new HttpError(404, "not found");
  }
  const p = parts.slice(1);

  if (p[0] === "health" && m === "GET") return json({ ok: true, oauth: oauthConfigured(env), links: Boolean(env.LINK_SECRET), secrets: Boolean(env.MASTER_KEY) });

  if (p[0] === "auth") {
    if (p[1] === "github" && m === "GET") return startLogin(env);
    if (p[1] === "callback" && m === "GET") return finishLogin(request, env, deps);
    if (p[1] === "logout" && m === "POST") return logout(request, env);
  }

  if (p[0] === "public") {
    if (p[1] === "dev" && p.length === 3 && m === "GET") return devPage(env, p[2]);
    if (p[1] === "links" && p.length === 3 && m === "GET") return linkPage(env, deps, p[2]);
  }

  if (p[0] === "enrol") {
    if (p[1] === "new" && m === "POST") return enrolNew(request, env, deps);
    if (p.length === 3 && p[2] === "profile.mobileconfig" && m === "GET") return enrolProfile(env, p[1]);
    if (p.length === 2 && m === "POST") return enrolCallback(request, env, deps, p[1]);
    if (p.length === 3 && p[2] === "status" && m === "GET") return enrolStatus(request, env, deps, p[1]);
  }

  if (p[0] === "build-ready" && m === "POST") return buildReady(request, env, deps);
  if (p[0] === "build" && p.length === 3 && p[2] === "profile" && m === "GET") return buildProfile(request, env, p[1]);

  if (p[0] === "dev") {
    const me = await requireDeveloper(request, env, deps);
    if (p[1] === "me" && m === "GET") return dev.me(env, me);
    if (p[1] === "me" && m === "PUT") return dev.updateMe(request, env, me);
    if (p[1] === "secrets" && m === "PUT") return dev.updateSecrets(request, env, deps, me);
    if (p[1] === "apps") {
      if (p.length === 2 && m === "GET") return dev.listApps(env, me);
      if (p.length === 2 && m === "POST") return dev.createApp(request, env, deps, me);
      if (p.length === 3 && m === "GET") return dev.getApp(env, me, p[2]);
      if (p.length === 3 && m === "PUT") return dev.updateApp(request, env, deps, me, p[2]);
      if (p.length === 3 && m === "DELETE") return dev.deleteApp(env, me, p[2]);
      if (p.length === 4 && p[3] === "build-token" && m === "POST") return dev.rotateBuildToken(env, deps, me, p[2]);
      if (p.length === 4 && p[3] === "links" && m === "POST") return dev.createLink(request, env, deps, me, p[2]);
    }
    if (p[1] === "links" && p.length === 4 && p[3] === "revoke" && m === "POST") return dev.revokeLink(env, deps, me, p[2], false);
    if (p[1] === "links" && p.length === 3 && m === "DELETE") return dev.revokeLink(env, deps, me, p[2], true);
    if (p[1] === "devices") {
      if (p.length === 2 && m === "GET") return dev.listDevices(env, me);
      if (p.length === 4 && p[3] === "approve" && m === "POST") return dev.approveDevice(env, deps, me, p[2]);
      if (p.length === 4 && p[3] === "reject" && m === "POST") return dev.rejectDevice(env, deps, me, p[2]);
      if (p.length === 3 && m === "DELETE") return dev.removeDevice(env, me, p[2]);
    }
  }
  throw new HttpError(404, "not found");
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
} satisfies ExportedHandler<Env>;
