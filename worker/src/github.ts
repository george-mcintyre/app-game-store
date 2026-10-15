// GitHub repository_dispatch to an app repo.
import type { Deps, Env } from "./env.js";

export const REBUILD_EVENT = "my-store-rebuild";

export interface RebuildPayload {
  app: string;
  enrolmentId: string;
  udid: string;
  deviceName: string;
  profileName: string;
  profileId: string;
  profileUuid: string;
  buildReadyUrl: string;
  profileUrl: string;
}

export async function dispatchRebuild(env: Env, deps: Deps, repo: string, payload: RebuildPayload): Promise<void> {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret is not set");
  const res = await deps.fetch(`${env.GITHUB_API_BASE}/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "app-game-store",
    },
    body: JSON.stringify({ event_type: REBUILD_EVENT, client_payload: payload }),
  });
  if (res.status !== 204) throw new Error(`repository_dispatch to ${repo}: ${res.status} ${await res.text()}`);
}
