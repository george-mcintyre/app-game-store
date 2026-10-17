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

export interface ReleaseInfo {
  manifestUrl: string;
  tag: string | null;
  publishedAt: string | null;
  assets: string[];
}

// Where my-app.json lives: a direct URL, or the asset of that name on the latest release.
export async function resolveRelease(env: Env, deps: Deps, app: AppRow, githubToken: string | undefined): Promise<ReleaseInfo> {
  if (app.manifestUrl) return { manifestUrl: app.manifestUrl, tag: null, publishedAt: null, assets: [] };
  if (!app.repo) throw new Error("the app has no repository set");
  const res = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/repos/${app.repo}/releases/latest`, githubToken, "application/vnd.github+json");
  if (res.status === 404) {
    throw new Error(githubToken ? `no published release found on ${app.repo} (drafts and pre-releases do not count)` : `no release visible on ${app.repo}; a private repository needs a GitHub token in Settings`);
  }
  if (!res.ok) throw new Error(`latest release for ${app.repo}: ${res.status}`);
  const release = (await res.json()) as { tag_name?: string; published_at?: string; assets?: { name: string; url: string }[] };
  const assets = release.assets ?? [];
  const asset = assets.find((a) => a.name === "my-app.json");
  if (!asset) throw new Error(`release ${release.tag_name ?? ""} on ${app.repo} has no asset named my-app.json`);
  return { manifestUrl: asset.url, tag: release.tag_name ?? null, publishedAt: release.published_at ?? null, assets: assets.map((a) => a.name) };
}

export async function loadManifest(env: Env, deps: Deps, app: AppRow, githubToken: string | undefined): Promise<AppManifest> {
  const { manifestUrl } = await resolveRelease(env, deps, app, githubToken);
  return fetchManifest(env, deps, app, manifestUrl, githubToken);
}

export async function fetchManifest(env: Env, deps: Deps, app: AppRow, manifestUrl: string, githubToken: string | undefined): Promise<AppManifest> {
  const res = await fetchUpstream(env, deps, manifestUrl, githubToken);
  if (!res.ok) throw new Error(`my-app.json for ${app.name}: ${res.status}`);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error(`my-app.json for ${app.name} is not valid JSON`);
  }
  const result = validateManifest(parsed);
  if (!result.ok) throw new Error(`my-app.json for ${app.name} is invalid: ${result.errors.join("; ")}`);
  return result.manifest;
}
