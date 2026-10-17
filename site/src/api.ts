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
  updatedAt: string;
}

export interface DevApp extends AppDetails {
  repo: string;
  manifestUrl: string;
  profileName: string;
  showOnPage: boolean;
  releaseIcon?: string;
  createdAt: string;
}

export interface Install {
  pwa: string | null;
  android: { apk: string } | null;
  ios: { bundleId: string; adhoc: string | null; testflight: string | null } | null;
}

export interface Release {
  version: string;
  minPlayers: number;
  maxPlayers: number;
  install: Install;
  fallbackName: string;
  fallbackIcon: string;
  fallbackDescription: string;
  fallbackScreenshots: string[];
}

export interface LinkPage {
  linkId: string | null;
  preview?: boolean;
  developer: { id: string; slug: string; displayName: string };
  app: AppDetails;
  release: Release | null;
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

export interface SecretStatus {
  apple: boolean;
  appleSavedAt: string | null;
  appleTeamId: string;
  appleTeamIdSavedAt: string | null;
  github: boolean;
  githubSavedAt: string | null;
}

export interface Me {
  developer: { id: string; slug: string; displayName: string; githubLogin: string; createdAt: string };
  authVia: "session" | "key";
  secrets: SecretStatus;
}

export interface ReleaseStatus {
  ok: boolean;
  githubToken: boolean;
  appleKey: boolean;
  profile: { uuid: string; expirationDate: string | null; devices: number } | null;
  tag: string | null;
  publishedAt: string | null;
  assets: string[];
  manifestUrl: string | null;
  version: string | null;
  install: { ios: boolean; android: boolean; pwa: boolean } | null;
  screenshots: number;
  errors: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

// Cached for the page lifetime so store pages can show the owner bar without a second round trip.
let mePromise: Promise<Me | null> | null = null;
export function whoAmI(force = false): Promise<Me | null> {
  if (!mePromise || force) {
    mePromise = api<Me>("GET", "/api/dev/me").catch(() => null);
  }
  return mePromise;
}
