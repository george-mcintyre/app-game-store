// Revision history for an app: one entry per GitHub Release, notes from the developer's CHANGELOG.md
// (shipped as a release asset), falling back to the release body, then the commit message.
import type { AppRow } from "./db.js";
import type { Deps, Env } from "./env.js";
import { fetchUpstream } from "./upstream.js";

export interface HistoryEntry {
  version: string;
  tag: string;
  title: string;
  notes: string;
  date: string | null;
  sha: string | null;
  releaseUrl: string | null;
  commitUrl: string | null;
}

const MAX_RELEASES = 30;
const MAX_COMMIT_LOOKUPS = 10;
const CACHE_SECONDS = 120;

interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets?: { name: string; url: string }[];
}

export const CHANGELOG_ASSET = /^changelog\.md$/i;

interface Tag {
  name: string;
  commit: { sha: string };
}

// "release-0.1.1-4" -> "0.1.1"; "v1.2.0-beta.1" -> "1.2.0-beta.1"; falls back to the tag itself.
export function versionLabel(tag: string, name: string | null): string {
  for (const candidate of [name ?? "", tag]) {
    const m = /\d+\.\d+(?:\.\d+)?(?:-[A-Za-z][\w.]*)?/.exec(candidate);
    if (m) return m[0];
  }
  return tag;
}

// A release name is worth showing only when it says more than the app name, version and build number.
export function releaseTitle(name: string | null, tag: string, version: string, appName = ""): string {
  const trimmed = (name ?? "").trim();
  if (trimmed === "" || trimmed === tag) return "";
  let rest = trimmed.replace(version, "");
  if (appName) rest = rest.replace(new RegExp(appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  rest = rest.replace(/\b(release|version|build|v)\b/gi, "").replace(/\d+/g, "").replace(/[\s\-:._()[\]]+/g, " ").trim();
  return rest.length >= 4 ? trimmed : "";
}

// Keep a Changelog sections: "## [1.2.0] - 2026-10-17", "## 1.2.0", "## v1.2.0 (2026-10-17)".
// Returns version -> cleaned notes. "[Unreleased]" and text before the first section are ignored.
export function parseChangelog(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) {
      const notes = cleanNotes(buf.join("\n"));
      if (notes !== "" && !out.has(current)) out.set(current, notes);
    }
    buf = [];
  };
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const section = /^##\s+\[?v?(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z][\w.]*)?)\]?/.exec(line);
    if (section) {
      flush();
      current = section[1];
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      current = null;
      continue;
    }
    if (current !== null) buf.push(line);
  }
  flush();
  return out;
}

// Strip GitHub's generated-notes boilerplate and markdown that would read badly to a friend.
export function cleanNotes(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*\*\*full changelog\*\*/i.test(line) && !/^\s*<!--/.test(line))
    .map((line) =>
      line
        .replace(/\s+by @[\w-]+ in https?:\/\/\S+/g, "")
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
        .replace(/https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/g, "#$1")
        .replace(/\*\*/g, "")
        .replace(/^\s*#{3,6}\s+(.+?)\s*:?$/, "$1:")
        .replace(/^\s*#{1,2}\s+/, "")
        .replace(/^\s*[-*]\s+/, "- ")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ghJson<T>(env: Env, deps: Deps, url: string, token: string | undefined): Promise<T | null> {
  const res = await fetchUpstream(env, deps, url, token, "application/vnd.github+json");
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function openCache(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

// Best effort: an empty list on any failure, cached briefly when non-empty.
export async function loadHistory(env: Env, deps: Deps, app: AppRow, githubToken: string | undefined): Promise<HistoryEntry[]> {
  if (!app.repo) return [];
  const cache = openCache();
  const key = new Request(`https://history.ourapps.internal/${app.id}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return (await hit.json()) as HistoryEntry[];
  }
  let entries: HistoryEntry[] = [];
  try {
    entries = await fetchHistory(env, deps, app, githubToken);
  } catch {
    entries = [];
  }
  if (cache && entries.length > 0) {
    await cache.put(key, new Response(JSON.stringify(entries), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` } })).catch(() => undefined);
  }
  return entries;
}

async function fetchHistory(env: Env, deps: Deps, app: AppRow, token: string | undefined): Promise<HistoryEntry[]> {
  const base = `${env.GITHUB_API_BASE}/repos/${app.repo}`;
  const [repo, releases, tags] = await Promise.all([
    ghJson<{ private: boolean }>(env, deps, base, token),
    ghJson<Release[]>(env, deps, `${base}/releases?per_page=${MAX_RELEASES}`, token),
    ghJson<Tag[]>(env, deps, `${base}/tags?per_page=100`, token),
  ]);
  if (!releases) return [];
  const isPublic = repo ? !repo.private : false;
  const shaByTag = new Map((tags ?? []).map((t) => [t.name, t.commit.sha]));
  const published = releases.filter((r) => !r.draft && !r.prerelease);
  const changelog = await loadChangelog(env, deps, published[0], token);
  const out: HistoryEntry[] = [];
  let lookups = 0;
  for (const r of published) {
    const sha = shaByTag.get(r.tag_name) ?? null;
    const version = versionLabel(r.tag_name, r.name);
    let notes = changelog.get(version) ?? cleanNotes(r.body ?? "");
    if (notes === "" && sha && lookups < MAX_COMMIT_LOOKUPS) {
      lookups++;
      const commit = await ghJson<{ commit: { message: string } }>(env, deps, `${base}/commits/${sha}`, token);
      if (commit) notes = cleanNotes(commit.commit.message);
    }
    out.push({
      version,
      tag: r.tag_name,
      title: releaseTitle(r.name, r.tag_name, version, app.name),
      notes,
      date: r.published_at,
      sha,
      releaseUrl: isPublic ? r.html_url : null,
      commitUrl: isPublic && sha ? `https://github.com/${app.repo}/commit/${sha}` : null,
    });
  }
  return out;
}

// The CHANGELOG.md asset on the latest published release covers every version at once.
async function loadChangelog(env: Env, deps: Deps, latest: Release | undefined, token: string | undefined): Promise<Map<string, string>> {
  const asset = latest?.assets?.find((a) => CHANGELOG_ASSET.test(a.name));
  if (!asset) return new Map();
  try {
    const res = await fetchUpstream(env, deps, asset.url, token);
    if (!res.ok) return new Map();
    return parseChangelog(await res.text());
  } catch {
    return new Map();
  }
}
