// Routes a friend or a visitor hits without signing in.
import { renderSVG } from "uqr";
import { Db, type AppRow, type Developer, type LinkRow } from "../db.js";
import type { Deps, Env } from "../env.js";
import { dlUrl, rewriteManifestUrls, signManifestLinks } from "../flow.js";
import { HttpError, json } from "../http.js";
import { verifyLink } from "../links.js";
import { loadSecrets } from "../secrets.js";
import { fetchUpstream, loadManifest } from "../upstream.js";

export function appDetails(app: AppRow) {
  return {
    id: app.id,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    whatsNew: app.whatsNew,
    size: app.size,
    minOs: app.minOs,
    ageNote: app.ageNote,
    privacySummary: app.privacySummary,
    iconUrl: app.iconUrl,
    screenshots: app.screenshots,
    updatedAt: app.updatedAt,
  };
}

export function linkActive(link: LinkRow, now: Date): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && Date.parse(link.expiresAt) < now.getTime()) return false;
  return true;
}

// GET /api/public/dev/:slug - a developer's opted-in apps, details only.
export async function devPage(env: Env, slug: string): Promise<Response> {
  const db = Db.from(env);
  const dev = await db.developerBySlug(slug);
  if (!dev) throw new HttpError(404, "no developer page here");
  const apps = await db.appsByDeveloper(dev.id, true);
  return json({ developer: { id: dev.id, slug: dev.slug, displayName: dev.displayName }, apps: apps.map(appDetails) });
}

// Everything an install page needs; shared by share links and the dashboard preview.
export async function buildLinkPage(env: Env, deps: Deps, app: AppRow, dev: Developer, linkId: string | null) {
  const secrets = await loadSecrets(env, dev.id);
  let manifest = null;
  let manifestError: string | null = null;
  try {
    manifest = await signManifestLinks(env, deps, dev.id, await loadManifest(env, deps, app, secrets.githubToken));
    // Private release assets need the token; the browser gets signed links instead.
    if (new URL(manifest.icon).host === "api.github.com") manifest.icon = await dlUrl(env, deps, { url: manifest.icon, kind: "icon", dev: dev.id });
    manifest.screenshots = await Promise.all(
      (manifest.screenshots ?? []).map((u) => (new URL(u).host === "api.github.com" ? dlUrl(env, deps, { url: u, kind: "icon", dev: dev.id }) : Promise.resolve(u))),
    );
  } catch (err) {
    manifestError = err instanceof Error ? err.message : String(err);
  }
  return {
    linkId,
    developer: { id: dev.id, slug: dev.slug, displayName: dev.displayName },
    app: appDetails(app),
    release: manifest
      ? {
          version: manifest.version,
          minPlayers: manifest.minPlayers,
          maxPlayers: manifest.maxPlayers,
          install: manifest.install,
          fallbackName: manifest.name,
          fallbackIcon: manifest.icon,
          fallbackDescription: manifest.description,
          fallbackScreenshots: manifest.screenshots ?? [],
        }
      : null,
    releaseError: manifestError,
  };
}

async function activeLink(env: Env, deps: Deps, linkId: string): Promise<{ link: LinkRow; app: AppRow; dev: Developer }> {
  const db = Db.from(env);
  const link = await db.linkById(linkId);
  if (!link) throw new HttpError(404, "no app behind this link");
  if (!linkActive(link, deps.now())) throw new HttpError(410, "this link is no longer active");
  const app = await db.appById(link.appId);
  const dev = app && (await db.developerById(app.developerId));
  if (!app || !dev) throw new HttpError(404, "no app behind this link");
  return { link, app, dev };
}

// GET /api/public/links/:id
export async function linkPage(env: Env, deps: Deps, linkId: string): Promise<Response> {
  const { link, app, dev } = await activeLink(env, deps, linkId);
  return json(await buildLinkPage(env, deps, app, dev, link.id));
}

// GET /api/public/links/:id/qr.svg
export async function linkQr(env: Env, deps: Deps, linkId: string): Promise<Response> {
  await activeLink(env, deps, linkId);
  const svg = renderSVG(`${env.PUBLIC_ORIGIN}/l/${linkId}`, { border: 2, pixelSize: 8 });
  return new Response(svg, { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}

// GET /dl/:token - stream an artefact behind a signed link; manifests get their .ipa links re-signed.
export async function serveArtefact(env: Env, deps: Deps, token: string): Promise<Response> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const link = await verifyLink(env.LINK_SECRET, token, deps.now());
  if (!link) throw new HttpError(403, "this link has expired; open the install page again");
  const secrets = await loadSecrets(env, link.dev);
  const upstream = await fetchUpstream(env, deps, link.url, secrets.githubToken);
  if (!upstream.ok) throw new HttpError(502, `upstream returned ${upstream.status}`);
  if (link.kind === "manifest") {
    const plist = await upstream.text();
    const rewritten = await rewriteManifestUrls(plist, (u) => dlUrl(env, deps, { url: u, kind: "ipa", dev: link.dev }));
    return new Response(rewritten, { status: 200, headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
  }
  if (link.kind === "icon") {
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "image/png", "Cache-Control": "private, max-age=3600" } });
  }
  const type = link.kind === "apk" ? "application/vnd.android.package-archive" : "application/octet-stream";
  const name = link.kind === "apk" ? "app.apk" : "app.ipa";
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
