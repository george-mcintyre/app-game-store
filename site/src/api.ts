import type { ScreenshotPlatform, ScreenshotSets } from "@my/store-shared";

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
  screenshotsByPlatform?: Partial<Record<ScreenshotPlatform, string[]>>;
  updatedAt: string;
}

export interface DevApp extends AppDetails {
  repo: string;
  manifestUrl: string;
  profileName: string;
  bundleId: string;
  showOnPage: boolean;
  releaseIcon?: string;
  createdAt: string;
}

export interface Install {
  pwa: string | null;
  android: { apk: string } | null;
  ios: { bundleId: string; adhoc: string | null; testflight: string | null; devices?: ("iphone" | "ipad")[] } | null;
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

export interface LinkPage {
  linkId: string | null;
  preview?: boolean;
  developer: { id: string; slug: string; displayName: string };
  app: AppDetails;
  release: Release | null;
  releaseError: string | null;
  history: HistoryEntry[];
  // The general list and the per-platform lists; the page picks one per version.
  screenshots?: ScreenshotSets;
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
  // When the registration profile was last downloaded, and in which browser.
  profileFetchedAt?: string | null;
  profileBrowser?: string | null;
}

export interface SecretStatus {
  apple: boolean;
  appleSavedAt: string | null;
  appleTeamId: string;
  appleTeamIdSavedAt: string | null;
  github: boolean;
  githubSavedAt: string | null;
  signing: SigningStatus | null;
}

export interface SigningStatus {
  name: string;
  serialNumber: string;
  expirationDate: string | null;
  createdAt: string;
}

export interface ProfileSummary {
  name: string;
  uuid: string;
  expirationDate: string | null;
  devices: number;
  createdAt?: string;
}

// The result of POST /api/dev/signing: the certificate, then one line per app.
export interface SigningSetUp {
  signing: SigningStatus;
  apps: { id: string; name: string; profile: ProfileSummary | null; error: string | null }[];
}

export interface Me {
  developer: { id: string; slug: string; displayName: string; githubLogin: string; createdAt: string; termsAcceptedVersion: string | null; termsAcceptedAt: string | null };
  authVia: "session" | "key";
  scope: "read" | "manage";
  termsVersion: string;
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
  // Web version: copied from web.zip by ourapps, or at the developer's own address.
  web: { hosting: "ourapps" | "own"; url: string | null; ok: boolean | null; status: number | null } | null;
  screenshots: number;
  changelog: boolean;
  errors: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "manage";
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface AuditEvent {
  id: number;
  event: string;
  detail: string;
  country: string | null;
  createdAt: string;
}

// Cached for the page lifetime so store pages can show the owner bar without a second round trip.
let mePromise: Promise<Me | null> | null = null;
export function whoAmI(force = false): Promise<Me | null> {
  if (!mePromise || force) {
    mePromise = api<Me>("GET", "/api/dev/me").catch(() => null);
  }
  return mePromise;
}
