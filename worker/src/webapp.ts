// Serves a developer's web.zip bundle at https://<linkId>.<store host>/ with nothing from the console origin.
import { unzipSync } from "fflate";
import installBanner from "./assets/install-banner.js";
import { Db, type AppRow, type Developer, type LinkRow } from "./db.js";
import type { Deps, Env } from "./env.js";
import { HttpError } from "./http.js";
import { linkActive } from "./routes/public.js";
import { loadSecrets } from "./secrets.js";
import { fetchUpstream, loadManifest, resolveRelease } from "./upstream.js";

export const WEB_ZIP_ASSET = /^web\.zip$/i;
const MiB = 1024 * 1024;
// Published limits for web.zip; see /reference. Sized for the free plan's memory and CPU.
export const WEB_LIMITS = { zipBytes: 25 * MiB, unpackedBytes: 32 * MiB, fileBytes: 24 * MiB, files: 2000, deflatedBytes: 8 * MiB };
const PACK_BYTES = 2 * MiB;
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

// Pre-compressed build output (Unity, Godot, Vite plugins): "x.wasm.br" is wasm sent with Content-Encoding br.
export function encodedFile(name: string): { type: string; encoding: "br" | "gzip" } | null {
  const m = /^(.*\.(wasm|js|mjs|data|json|css|html|svg|txt|symbols\.json))\.(br|gz)$/i.exec(name);
  if (!m) return null;
  const inner = m[1];
  const encoding = m[3].toLowerCase() === "br" ? "br" : "gzip";
  // Unity's own server samples label gzip data as application/gzip to work around a Safari bug.
  if (/\.data$/i.test(inner)) return { type: encoding === "gzip" ? "application/gzip" : "application/octet-stream", encoding };
  return { type: contentType(inner), encoding };
}

export interface HeaderRule {
  pattern: string;
  headers: [string, string][];
}

// Headers a bundle may set through a "_headers" file, in the format Cloudflare Pages and Netlify use.
const ALLOWED_BUNDLE_HEADERS = new Set(["cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy", "permissions-policy", "content-security-policy", "cache-control"]);

export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: trimmed, headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const i = trimmed.indexOf(":");
    if (i <= 0) continue;
    const name = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (ALLOWED_BUNDLE_HEADERS.has(name.toLowerCase()) && value !== "" && !/[\r\n]/.test(value)) current.headers.push([name, value]);
  }
  return rules.filter((r) => r.headers.length > 0).slice(0, 50);
}

export function headersFor(rules: HeaderRule[], pathname: string): [string, string][] {
  const out: [string, string][] = [];
  for (const r of rules) {
    const p = r.pattern;
    const match = p === "/*" || p === "*" || (p.endsWith("*") ? pathname.startsWith(p.slice(0, -1)) : pathname === p);
    if (match) out.push(...r.headers);
  }
  return out;
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
export type WebHosting = { hosting: "ourapps"; url: null; ok: null; status: null } | { hosting: "own"; url: string; ok: boolean; status: number | null };

// Where the web version lives: copied from web.zip by ourapps, or at the developer's own address,
// which is fetched once to confirm it answers.
export async function webHosting(deps: Deps, pwa: string | null, release: { manifestUrl: string; assets: string[] } | null): Promise<WebHosting | null> {
  if (!pwa) return null;
  if (isBundleUrl(pwa, release)) return { hosting: "ourapps", url: null, ok: null, status: null };
  try {
    const res = await deps.fetch(pwa, { redirect: "follow", headers: { "User-Agent": "ourapps" } });
    await res.body?.cancel();
    return { hosting: "own", url: pwa, ok: res.ok, status: res.status };
  } catch {
    return { hosting: "own", url: pwa, ok: false, status: null };
  }
}

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

const IGNORED = (name: string) => name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(name);

// Unzips a bundle within the published limits; strips one leading folder when every entry sits under it.
export function extractBundle(zip: Uint8Array): Record<string, Uint8Array> {
  if (zip.byteLength > WEB_LIMITS.zipBytes) throw new HttpError(502, `web.zip is ${mb(zip.byteLength)}; the limit is ${mb(WEB_LIMITS.zipBytes)}`);
  // First pass reads the directory only, so nothing is inflated before the limits are checked.
  let total = 0;
  let deflated = 0;
  let count = 0;
  const tooBig: string[] = [];
  unzipSync(zip, {
    filter: (f) => {
      if (IGNORED(f.name)) return false;
      count++;
      total += f.originalSize;
      if (f.compression !== 0) deflated += f.originalSize;
      if (f.originalSize > WEB_LIMITS.fileBytes) tooBig.push(f.name);
      return false;
    },
  });
  if (count === 0) throw new HttpError(502, "web.zip is empty");
  if (count > WEB_LIMITS.files) throw new HttpError(502, `web.zip has ${count} files; the limit is ${WEB_LIMITS.files}`);
  if (tooBig.length > 0) throw new HttpError(502, `web.zip has files over ${mb(WEB_LIMITS.fileBytes)}: ${tooBig.slice(0, 3).join(", ")}`);
  if (total > WEB_LIMITS.unpackedBytes) throw new HttpError(502, `web.zip unpacks to ${mb(total)}; the limit is ${mb(WEB_LIMITS.unpackedBytes)}`);
  if (deflated > WEB_LIMITS.deflatedBytes) {
    throw new HttpError(502, `web.zip compresses ${mb(deflated)} of files; build it without compression (zip -0 -r web.zip .) so the store can unpack it within its limits`);
  }
  const raw = unzipSync(zip, { filter: (f) => !IGNORED(f.name) });
  const names = Object.keys(raw);
  const first = names[0].split("/")[0];
  const prefixed = names.every((n) => n.startsWith(`${first}/`));
  const out: Record<string, Uint8Array> = {};
  for (const n of names) out[prefixed ? n.slice(first.length + 1) : n] = raw[n];
  if (!out["index.html"]) throw new HttpError(502, "web.zip has no index.html at its root");
  return out;
}

function mb(bytes: number): string {
  return `${(bytes / MiB).toFixed(1)} MB`;
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

const FILES_TTL_SECONDS = 60 * 60 * 24 * 30;
const INDEX_KEY = (appId: string) => `webapp:${appId}:index`;
const PACK_KEY = (appId: string, tag: string, n: number) => `webapp:${appId}:${tag}:pack:${n}`;

interface FileEntry {
  p: number;
  o: number;
  l: number;
}

export interface BundleIndex {
  v: 2;
  tag: string;
  packs: number;
  files: Record<string, FileEntry>;
  iconHref: string | null;
  headers: HeaderRule[];
  unpackedAt: string;
}

function cacheKey(env: Env, path: string): Request {
  // Keys use the store's own hostname; arbitrary hostnames are not guaranteed to cache.
  return new Request(`${env.PUBLIC_ORIGIN}/__cache/${path}`);
}

function edgeCache(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

// Which release is current, checked at most once a minute per app so GitHub is not asked on every hit.
async function currentTag(env: Env, deps: Deps, app: AppRow, token: string | undefined): Promise<{ tag: string; assets: string[] }> {
  const cache = edgeCache();
  const key = cacheKey(env, `webapp/${app.id}/release`);
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return (await hit.json()) as { tag: string; assets: string[] };
  }
  const release = await resolveRelease(env, deps, app, token);
  const out = { tag: release.tag ?? "direct", assets: release.assets };
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" } })).catch(() => undefined);
  return out;
}

// Groups files into packs of about 2 MB; a file larger than that is a pack of its own.
export function buildPacks(files: Record<string, Uint8Array>): { packs: Uint8Array[]; index: Record<string, FileEntry> } {
  const packs: Uint8Array[] = [];
  const index: Record<string, FileEntry> = {};
  let pending: { name: string; body: Uint8Array }[] = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pending.length === 0) return;
    const buf = new Uint8Array(pendingBytes);
    let o = 0;
    for (const f of pending) {
      buf.set(f.body, o);
      index[f.name] = { p: packs.length, o, l: f.body.byteLength };
      o += f.body.byteLength;
    }
    packs.push(buf);
    pending = [];
    pendingBytes = 0;
  };
  for (const name of Object.keys(files).sort()) {
    const body = files[name];
    if (body.byteLength > PACK_BYTES) {
      flush();
      index[name] = { p: packs.length, o: 0, l: body.byteLength };
      packs.push(body);
      continue;
    }
    if (pendingBytes + body.byteLength > PACK_BYTES) flush();
    pending.push({ name, body });
    pendingBytes += body.byteLength;
  }
  flush();
  return { packs, index };
}

// Unpacks the release's web.zip once into KV as a few packs; later requests read one pack, or the edge cache.
async function ensureUnpacked(env: Env, deps: Deps, app: AppRow, token: string | undefined, current: { tag: string; assets: string[] }, force = false): Promise<BundleIndex> {
  const existing = await env.WEBAPP_FILES.get<BundleIndex>(INDEX_KEY(app.id), "json");
  if (!force && existing && existing.v === 2 && existing.tag === current.tag) return existing;
  const asset = await findWebZip(env, deps, app, token, { manifestUrl: "", assets: current.assets });
  const res = await fetchUpstream(env, deps, asset, token);
  if (!res.ok) throw new HttpError(502, `web.zip could not be fetched (${res.status})`);
  const files = extractBundle(new Uint8Array(await res.arrayBuffer()));
  const headersText = files["_headers"] ? decoder.decode(files["_headers"]) : "";
  delete files["_headers"];
  const iconHref = inspectHead(decoder.decode(files["index.html"])).iconHref;
  const { packs, index } = buildPacks(files);
  await Promise.all(packs.map((p, n) => env.WEBAPP_FILES.put(PACK_KEY(app.id, current.tag, n), p, { expirationTtl: FILES_TTL_SECONDS })));
  const next: BundleIndex = { v: 2, tag: current.tag, packs: packs.length, files: index, iconHref, headers: parseHeadersFile(headersText), unpackedAt: deps.now().toISOString() };
  await env.WEBAPP_FILES.put(INDEX_KEY(app.id), JSON.stringify(next), { expirationTtl: FILES_TTL_SECONDS });
  if (existing && existing.v === 2 && existing.tag !== current.tag) {
    await Promise.all(Array.from({ length: existing.packs }, (_, n) => env.WEBAPP_FILES.delete(PACK_KEY(app.id, existing.tag, n)).catch(() => undefined)));
  }
  return next;
}

// Bytes of one file: edge cache first, then its pack in KV; null when the pack has gone missing.
async function readFile(env: Env, app: AppRow, index: BundleIndex, name: string): Promise<Uint8Array | null> {
  const entry = index.files[name];
  const cache = edgeCache();
  const key = cacheKey(env, `webapp/${app.id}/${encodeURIComponent(index.tag)}/${encodeURIComponent(name)}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const pack = await env.WEBAPP_FILES.get(PACK_KEY(app.id, index.tag, entry.p), "arrayBuffer");
  if (!pack) return null;
  const bytes = new Uint8Array(pack, entry.o, entry.l);
  if (cache) await cache.put(key, new Response(bytes.slice(), { headers: { "Cache-Control": `max-age=${FILE_CACHE_SECONDS}` } })).catch(() => undefined);
  return bytes;
}

// Resolves the file name to serve from the index alone; no bytes are read yet.
export function pickName(names: readonly string[], pathname: string): string | null {
  const set = new Set(names);
  let path = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (path.includes("..")) return null;
  if (path === "" || path.endsWith("/")) path += "index.html";
  if (set.has(path)) return path;
  if (set.has(`${path}/index.html`)) return `${path}/index.html`;
  if (set.has("index.html") && !/\.[a-z0-9]{1,8}$/i.test(path)) return "index.html";
  return null;
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

// Where the web version lives when the latest release has no web.zip, so home screen icons made
// from a link address open the app.
async function movedTo(env: Env, deps: Deps, app: AppRow, token: string | undefined): Promise<string | null> {
  const pwa = (await loadManifest(env, deps, app, token)).install.pwa;
  if (!pwa || isBundleUrl(pwa, null)) return null;
  const target = new URL(pwa);
  return target.protocol === "https:" && !target.host.endsWith(new URL(env.PUBLIC_ORIGIN).host) ? target.toString() : null;
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
  const url = new URL(request.url);
  // Console paths never exist on an app host, so nothing can mistake one for the other.
  if (/^\/(api|dl|__cache)(\/|$)/.test(url.pathname)) return plainPage(404, "Not found", "That file is not in the app.");
  const appName = located.app.name || "App";
  if (url.pathname === BANNER_PATH) {
    return new Response(installBanner, { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": `public, max-age=${FILE_CACHE_SECONDS}` } });
  }
  const secrets = await loadSecrets(env, located.dev.id, ["githubToken"]);
  let index: BundleIndex;
  let current: { tag: string; assets: string[] };
  try {
    current = await currentTag(env, deps, located.app, secrets.githubToken);
    index = await ensureUnpacked(env, deps, located.app, secrets.githubToken, current);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      const moved = await movedTo(env, deps, located.app, secrets.githubToken).catch(() => null);
      if (moved) return Response.redirect(new URL(url.pathname.slice(1) + url.search, moved).toString(), 302);
    }
    // Only deliberate messages reach a public page; others (which can name a private repository) are logged.
    if (err instanceof HttpError) return plainPage(err.status === 404 ? 404 : 502, "The web app is not available", err.message);
    console.error(`web app ${linkId}: ${err instanceof Error ? err.message : String(err)}`);
    return plainPage(502, "The web app is not available", "Its latest release could not be read. Try again later, or ask the person who sent the link.");
  }
  const names = Object.keys(index.files);
  const iconUrl = index.iconHref ?? (index.files["icon.png"] ? "./icon.png" : index.files["icon.svg"] ? "./icon.svg" : null);
  if (url.pathname === DEFAULT_MANIFEST_PATH) {
    return new Response(defaultManifest(appName, iconUrl), { status: 200, headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
  }
  const name = pickName(names, url.pathname);
  if (!name) return plainPage(404, "Not found", "That file is not in the app.");
  const etag = `"${index.tag}:${name}"`;
  const encoded = encodedFile(name);
  const isHtml = name.endsWith(".html");
  const headers: Record<string, string> = {
    "Content-Type": encoded ? encoded.type : contentType(name),
    ETag: etag,
    "Cache-Control": isHtml ? "no-cache" : `public, max-age=${FILE_CACHE_SECONDS}`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Robots-Tag": "noindex",
    ...(encoded ? { "Content-Encoding": encoded.encoding, Vary: "Accept-Encoding" } : {}),
    ...(isHtml ? { "Content-Security-Policy": "frame-ancestors 'none'", "Cross-Origin-Opener-Policy": "same-origin" } : {}),
  };
  for (const [k, v] of headersFor(index.headers, url.pathname)) headers[k] = v;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  let body: Uint8Array | string | null = null;
  if (request.method === "GET") {
    let bytes = await readFile(env, located.app, index, name);
    if (!bytes) {
      // The pack expired or was removed: unpack again once, then retry.
      index = await ensureUnpacked(env, deps, located.app, secrets.githubToken, current, true).catch(() => index);
      bytes = index.files[name] ? await readFile(env, located.app, index, name) : null;
      if (!bytes) return plainPage(502, "The web app is not available", "A file went missing from the cache; reload in a moment.");
    }
    body = isHtml && !encoded ? decorateHtml(decoder.decode(bytes), appName, iconUrl) : bytes;
  }
  return new Response(body, { status: 200, headers, ...(encoded ? { encodeBody: "manual" as const } : {}) });
}
