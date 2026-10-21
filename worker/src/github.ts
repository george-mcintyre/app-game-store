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

export async function dispatchRebuild(env: Env, deps: Deps, token: string | undefined, repo: string, payload: RebuildPayload): Promise<void> {
  if (!token) throw new Error("no GitHub token saved in account settings");
  const res = await deps.fetch(`${env.GITHUB_API_BASE}/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "ourapps",
    },
    body: JSON.stringify({ event_type: REBUILD_EVENT, client_payload: payload }),
  });
  if (res.status !== 204) throw new Error(`repository_dispatch to ${repo}: ${res.status} ${await res.text()}`);
}

// Any repository_dispatch event, for requests other than a rebuild for a new device.
export async function dispatchEvent(env: Env, deps: Deps, token: string | undefined, repo: string, event: string, payload: Record<string, unknown>): Promise<void> {
  if (!token) throw new Error("no GitHub token saved in account settings");
  const res = await deps.fetch(`${env.GITHUB_API_BASE}/repos/${repo}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "ourapps" },
    body: JSON.stringify({ event_type: event, client_payload: payload }),
  });
  if (res.status !== 204) throw new Error(`repository_dispatch to ${repo}: ${res.status} ${await res.text()}`);
}
