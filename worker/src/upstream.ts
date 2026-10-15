import { validateManifest, type AppManifest } from "@my/store-shared";
import type { AppRow } from "./db.js";
import type { Deps, Env } from "./env.js";

// Fetch an artefact or manifest; GitHub release-asset URLs get the developer's token.
export function fetchUpstream(env: Env, deps: Deps, url: string, githubToken: string | undefined, accept?: string): Promise<Response> {
  const headers = new Headers({ "User-Agent": "ourapps" });
  const host = new URL(url).host;
  if (host === "api.github.com" && githubToken) {
    headers.set("Authorization", `Bearer ${githubToken}`);
    headers.set("Accept", accept ?? "application/octet-stream");
  } else if (accept) {
    headers.set("Accept", accept);
  }
  return deps.fetch(url, { headers, redirect: "follow" });
}

// Where my-app.json lives: a direct URL, or the asset of that name on the latest release.
export async function resolveManifestUrl(env: Env, deps: Deps, app: AppRow, githubToken: string | undefined): Promise<string> {
  if (app.manifestUrl) return app.manifestUrl;
  const res = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/repos/${app.repo}/releases/latest`, githubToken, "application/vnd.github+json");
  if (!res.ok) throw new Error(`latest release for ${app.repo}: ${res.status}`);
  const release = (await res.json()) as { assets?: { name: string; url: string }[] };
  const asset = release.assets?.find((a) => a.name === "my-app.json");
  if (!asset) throw new Error(`latest release for ${app.repo} has no my-app.json asset`);
  return asset.url;
}

export async function loadManifest(env: Env, deps: Deps, app: AppRow, githubToken: string | undefined): Promise<AppManifest> {
  const url = await resolveManifestUrl(env, deps, app, githubToken);
  const res = await fetchUpstream(env, deps, url, githubToken);
  if (!res.ok) throw new Error(`my-app.json for ${app.name}: ${res.status}`);
  const result = validateManifest(await res.json());
  if (!result.ok) throw new Error(`my-app.json for ${app.name} is invalid: ${result.errors.join("; ")}`);
  return result.manifest;
}
