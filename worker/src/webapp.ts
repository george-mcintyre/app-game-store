// Serves a developer's web.zip bundle at https://<linkId>.<store host>/ with nothing from the console origin.
import { unzipSync } from "fflate";
import installBanner from "./assets/install-banner.js";
import { Db, type AppRow, type Developer, type LinkRow } from "./db.js";
import type { Deps, Env } from "./env.js";
import { HttpError } from "./http.js";
import { linkActive } from "./routes/public.js";
import { loadSecrets } from "./secrets.js";
import { fetchUpstream, resolveRelease } from "./upstream.js";

export const WEB_ZIP_ASSET = /^web\.zip$/i;
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BUNDLE_CACHE_SECONDS = 60 * 60;
const FILE_CACHE_SECONDS = 60 * 60 * 24;
export const BANNER_PATH = "/__ourapps/install.js";
export const DEFAULT_MANIFEST_PATH = "/__ourapps/manifest.webmanifest";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  wasm: "application/wasm",
  xml: "application/xml",
  pdf: "application/pdf",
};

export function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

// Is this request for a per-link app host rather than the console host?
export function webAppLinkId(request: Request, env: Env): string | null {
  const host = new URL(request.url).host.toLowerCase();
  const base = new URL(env.PUBLIC_ORIGIN).host.toLowerCase();
  if (!host.endsWith(`.${base}`)) return null;
  const sub = host.slice(0, -(base.length + 1));
  return /^[0-9a-f]{16,64}$/.test(sub) ? sub : null;
}

export function webAppUrl(env: Env, linkId: string): string {
  const u = new URL(env.PUBLIC_ORIGIN);
  return `${u.protocol}//${linkId}.${u.host}/`;
}

// Does the manifest's pwa value name a web.zip bundle the store should serve?
export function isBundleUrl(pwa: string | null | undefined, release: { manifestUrl: string; assets: string[] } | null): boolean {
  if (!pwa) return false;
  try {
    const u = new URL(pwa);
    if (u.host !== "api.github.com" || !/\/releases\/assets\/\d+$/.test(u.pathname)) return false;
  } catch {
    return false;
  }
  return release ? release.assets.some((n) => WEB_ZIP_ASSET.test(n)) : true;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export interface HeadFacts {
  hasManifest: boolean;
  hasAppleCapable: boolean;
  hasAppleTitle: boolean;
  hasAppleIcon: boolean;
  hasThemeColor: boolean;
  hasViewport: boolean;
  hasAppName: boolean;
  iconHref: string | null;
}

export function inspectHead(htmlText: string): HeadFacts {
  const head = htmlText.slice(0, 64 * 1024);
  const has = (re: RegExp) => re.test(head);
  const icon = /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i.exec(head) ?? /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i.exec(head);
  return {
    hasManifest: has(/<link[^>]+rel=["']manifest["']/i),
    hasAppleCapable: has(/<meta[^>]+name=["']apple-mobile-web-app-capable["']/i),
    hasAppleTitle: has(/<meta[^>]+name=["']apple-mobile-web-app-title["']/i),
    hasAppleIcon: has(/<link[^>]+rel=["']apple-touch-icon["']/i),
    hasThemeColor: has(/<meta[^>]+name=["']theme-color["']/i),
    hasViewport: has(/<meta[^>]+name=["']viewport["']/i),
    hasAppName: has(/<meta[^>]+name=["']application-name["']/i),
    iconHref: icon ? icon[1] : null,
  };
}

// Adds what "Add to Home Screen" needs when the bundle left it out, plus the install banner.
export function decorateHtml(htmlText: string, appName: string, iconUrl: string | null): string {
  const f = inspectHead(htmlText);
  const safeName = appName.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const parts: string[] = [];
  if (!f.hasViewport) parts.push('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  if (!f.hasManifest) parts.push(`<link rel="manifest" href="${DEFAULT_MANIFEST_PATH}">`);
  if (!f.hasAppleCapable) parts.push('<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">');
  if (!f.hasAppleTitle) parts.push(`<meta name="apple-mobile-web-app-title" content="${safeName}">`);
  if (!f.hasAppName) parts.push(`<meta name="application-name" content="${safeName}">`);
  if (!f.hasAppleIcon) {
    const href = f.iconHref ?? iconUrl;
    if (href) parts.push(`<link rel="apple-touch-icon" href="${href.replace(/"/g, "&quot;")}">`);
  }
  if (!f.hasThemeColor) parts.push('<meta name="theme-color" content="#1d1d1f">');
  parts.push(`<script src="${BANNER_PATH}" defer></script>`);
  const inject = parts.join("");
  const headClose = htmlText.search(/<\/head\s*>/i);
  if (headClose >= 0) return htmlText.slice(0, headClose) + inject + htmlText.slice(headClose);
  const headOpen = /<head[^>]*>/i.exec(htmlText);
  if (headOpen) return htmlText.slice(0, headOpen.index + headOpen[0].length) + inject + htmlText.slice(headOpen.index + headOpen[0].length);
  return inject + htmlText;
}

// Manifest for bundles that ship none: enough for a standalone home screen app.
export function defaultManifest(appName: string, iconUrl: string | null, themeColor = "#1d1d1f"): string {
  const icons = iconUrl ? [{ src: iconUrl, sizes: "any", purpose: "any" }] : [];
  return JSON.stringify({ name: appName, short_name: appName.slice(0, 12), start_url: "./", scope: "./", display: "standalone", background_color: "#ffffff", theme_color: themeColor, icons });
}

// Resolves a path inside the bundle; index.html for "/" and for anything that is not a file.
export function pickFile(files: Record<string, Uint8Array>, pathname: string): { name: string; body: Uint8Array } | null {
  let path = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (path.includes("..")) return null;
  if (path === "" || path.endsWith("/")) path += "index.html";
  if (files[path]) return { name: path, body: files[path] };
  if (files[`${path}/index.html`]) return { name: `${path}/index.html`, body: files[`${path}/index.html`] };
  if (files["index.html"] && !/\.[a-z0-9]{1,8}$/i.test(path)) return { name: "index.html", body: files["index.html"] };
  return null;
}

// Unzips a bundle; strips one leading folder when every entry sits under it.
export function extractBundle(zip: Uint8Array): Record<string, Uint8Array> {
  if (zip.byteLength > MAX_ZIP_BYTES) throw new HttpError(502, "web.zip is larger than 25 MB");
  const raw = unzipSync(zip, { filter: (f) => f.originalSize <= MAX_FILE_BYTES && !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(f.name) });
  const names = Object.keys(raw);
  if (names.length === 0) throw new HttpError(502, "web.zip is empty");
  const first = names[0].split("/")[0];
  const prefixed = names.every((n) => n.startsWith(`${first}/`));
  const out: Record<string, Uint8Array> = {};
  for (const n of names) out[prefixed ? n.slice(first.length + 1) : n] = raw[n];
  if (!out["index.html"]) throw new HttpError(502, "web.zip has no index.html at its root");
  return out;
}

interface Located {
  link: LinkRow;
  app: AppRow;
  dev: Developer;
}

async function locate(env: Env, deps: Deps, linkId: string): Promise<Located> {
  const db = Db.from(env);
  const link = await db.linkById(linkId);
  if (!link) throw new HttpError(404, "no app behind this address");
  if (!linkActive(link, deps.now())) throw new HttpError(410, "this link is no longer active");
  const app = await db.appById(link.appId);
  const dev = app && (await db.developerById(app.developerId));
  if (!app || !dev) throw new HttpError(404, "no app behind this address");
  return { link, app, dev };
}

function cacheStore(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

// Fetches the bundle for the app's latest release, caching the zip per release tag.
async function loadBundle(env: Env, deps: Deps, app: AppRow, token: string | undefined): Promise<{ files: Record<string, Uint8Array>; tag: string }> {
  const release = await resolveRelease(env, deps, app, token);
  const cache = cacheStore();
  const tag = release.tag ?? "direct";
  const key = new Request(`https://webapp.ourapps.internal/${app.id}/${encodeURIComponent(tag)}/web.zip`);
  let zip: Uint8Array | null = null;
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) zip = new Uint8Array(await hit.arrayBuffer());
  }
  if (!zip) {
    const asset = await findWebZip(env, deps, app, token, release);
    const res = await fetchUpstream(env, deps, asset, token);
    if (!res.ok) throw new HttpError(502, `web.zip could not be fetched (${res.status})`);
    zip = new Uint8Array(await res.arrayBuffer());
    if (cache && zip.byteLength <= MAX_ZIP_BYTES) {
      await cache.put(key, new Response(zip, { headers: { "Content-Type": "application/zip", "Cache-Control": `max-age=${BUNDLE_CACHE_SECONDS}` } })).catch(() => undefined);
    }
  }
  return { files: extractBundle(zip), tag };
}

async function findWebZip(env: Env, deps: Deps, app: AppRow, token: string | undefined, release: { manifestUrl: string; assets: string[] }): Promise<string> {
  if (!release.assets.some((n) => WEB_ZIP_ASSET.test(n))) throw new HttpError(404, "the latest release has no web.zip");
  const res = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/repos/${app.repo}/releases/latest`, token, "application/vnd.github+json");
  if (!res.ok) throw new HttpError(502, `latest release: ${res.status}`);
  const body = (await res.json()) as { assets?: { name: string; url: string }[] };
  const asset = body.assets?.find((a) => WEB_ZIP_ASSET.test(a.name));
  if (!asset) throw new HttpError(404, "the latest release has no web.zip");
  return asset.url;
}

function plainPage(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f7;color:#1d1d1f}main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#6e6e73;margin:0}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// GET https://<linkId>.<host>/<path>
export async function serveWebApp(request: Request, env: Env, deps: Deps, linkId: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return plainPage(405, "Not allowed", "This address only serves the app's files.");
  let located: Located;
  try {
    located = await locate(env, deps, linkId);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return plainPage(status, status === 410 ? "This link is no longer active" : "Nothing here", status === 410 ? "Ask the person who sent it for a new one." : "There is no app at this address.");
  }
  const secrets = await loadSecrets(env, located.dev.id, ["githubToken"]);
  let bundle: { files: Record<string, Uint8Array>; tag: string };
  try {
    bundle = await loadBundle(env, deps, located.app, secrets.githubToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return plainPage(err instanceof HttpError && err.status === 404 ? 404 : 502, "The web app is not available", message);
  }
  const url = new URL(request.url);
  // Console paths never exist on an app host, so nothing can mistake one for the other.
  if (/^\/(api|dl)(\/|$)/.test(url.pathname)) return plainPage(404, "Not found", "That file is not in the app.");
  const appName = located.app.name || "App";
  const bundleIcon = inspectHead(decoder.decode(bundle.files["index.html"])).iconHref;
  const iconUrl = bundleIcon ?? (bundle.files["icon.png"] ? "./icon.png" : bundle.files["icon.svg"] ? "./icon.svg" : null);
  if (url.pathname === BANNER_PATH) {
    return new Response(installBanner, { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": `public, max-age=${FILE_CACHE_SECONDS}` } });
  }
  if (url.pathname === DEFAULT_MANIFEST_PATH) {
    return new Response(defaultManifest(appName, iconUrl), { status: 200, headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
  }
  const file = pickFile(bundle.files, url.pathname);
  if (!file) return plainPage(404, "Not found", "That file is not in the app.");
  const etag = `"${bundle.tag}:${file.name}:${file.body.byteLength}"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const isHtml = file.name.endsWith(".html");
  const body = isHtml ? encoder.encode(decorateHtml(decoder.decode(file.body), appName, iconUrl)) : file.body;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": contentType(file.name),
      ETag: etag,
      "Cache-Control": isHtml ? "no-cache" : `public, max-age=${FILE_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Robots-Tag": "noindex",
      ...(isHtml ? { "Content-Security-Policy": "frame-ancestors 'none'", "Cross-Origin-Opener-Policy": "same-origin" } : {}),
    },
  });
}
