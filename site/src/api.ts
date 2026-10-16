// Calls to the worker on the same origin.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `request failed (${res.status})`);
  return data;
}

export interface AppDetails {
  id: string;
  name: string;
  tagline: string;
  description: string;
  whatsNew: string;
  size: string;
  minOs: string;
  ageNote: string;
  privacySummary: string;
  iconUrl: string;
  screenshots: string[];
}

export interface DevApp extends AppDetails {
  repo: string;
  manifestUrl: string;
  profileName: string;
  showOnPage: boolean;
  releaseIcon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Install {
  pwa: string | null;
  android: { apk: string } | null;
  ios: { bundleId: string; adhoc: string | null; testflight: string | null } | null;
}

export interface LinkPage {
  linkId: string;
  developer: { slug: string; displayName: string };
  app: AppDetails;
  release: { version: string; minPlayers: number; maxPlayers: number; install: Install; fallbackName: string; fallbackIcon: string; fallbackDescription: string; fallbackScreenshots: string[] } | null;
  releaseError: string | null;
}

export interface ShareLink {
  id: string;
  appId: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface Enrolment {
  id: string;
  appId: string;
  linkId: string;
  name: string;
  state: string;
  udid: string | null;
  product: string | null;
  profileUuid: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Me {
  developer: { id: string; slug: string; displayName: string; githubLogin: string };
  secrets: { apple: boolean; appleSavedAt: string | null; appleTeamId: string; appleTeamIdSavedAt: string | null; github: boolean; githubSavedAt: string | null };
}
