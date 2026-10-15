import type { EnrolmentState } from "@my/store-shared";
import type { Env } from "./env.js";

// One app the store may show and rebuild.
export interface AppRecord {
  id: string;
  linkId: string;
  // GitHub owner/name; my-app.json is the asset of that name on the latest release.
  repo: string;
  // Optional direct URL to my-app.json for apps hosted outside GitHub Releases.
  manifestUrl?: string;
  profileName: string;
  createdAt: string;
}

// One friend's device going through enrolment.
export interface EnrolmentRecord {
  id: string;
  app: string;
  linkId: string;
  name: string;
  state: EnrolmentState;
  udid?: string;
  product?: string;
  appleDeviceId?: string;
  profileUuid?: string;
  manifestUrl?: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

// The Ad Hoc profile the worker last created for an app.
export interface ProfileRecord {
  app: string;
  profileId: string;
  profileName: string;
  uuid: string;
  profileBase64: string;
  udids: string[];
  expirationDate?: string;
  createdAt: string;
}

const APP = (id: string) => `app:${id}`;
const LINK = (linkId: string) => `link:${linkId}`;
const ENROL = (id: string) => `enrol:${id}`;
const PROFILE = (app: string) => `profile:${app}`;

export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getApp(env: Env, id: string): Promise<AppRecord | null> {
  return env.STORE.get<AppRecord>(APP(id), "json");
}

export async function getAppByLink(env: Env, linkId: string): Promise<AppRecord | null> {
  const id = await env.STORE.get(LINK(linkId));
  return id ? getApp(env, id) : null;
}

export async function putApp(env: Env, app: AppRecord): Promise<void> {
  await env.STORE.put(APP(app.id), JSON.stringify(app));
  await env.STORE.put(LINK(app.linkId), app.id);
}

export async function deleteApp(env: Env, id: string): Promise<void> {
  const app = await getApp(env, id);
  if (!app) return;
  await env.STORE.delete(LINK(app.linkId));
  await env.STORE.delete(APP(id));
}

export async function listApps(env: Env): Promise<AppRecord[]> {
  const list = await env.STORE.list({ prefix: "app:" });
  const apps = await Promise.all(list.keys.map((k) => env.STORE.get<AppRecord>(k.name, "json")));
  return apps.filter((a): a is AppRecord => a !== null);
}

export async function getEnrolment(env: Env, id: string): Promise<EnrolmentRecord | null> {
  return env.STORE.get<EnrolmentRecord>(ENROL(id), "json");
}

export async function putEnrolment(env: Env, record: EnrolmentRecord): Promise<void> {
  await env.STORE.put(ENROL(record.id), JSON.stringify(record));
}

export async function listEnrolments(env: Env, app?: string): Promise<EnrolmentRecord[]> {
  const list = await env.STORE.list({ prefix: "enrol:" });
  const records = await Promise.all(list.keys.map((k) => env.STORE.get<EnrolmentRecord>(k.name, "json")));
  return records
    .filter((r): r is EnrolmentRecord => r !== null && (app === undefined || r.app === app))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getProfile(env: Env, app: string): Promise<ProfileRecord | null> {
  return env.STORE.get<ProfileRecord>(PROFILE(app), "json");
}

export async function putProfile(env: Env, profile: ProfileRecord): Promise<void> {
  await env.STORE.put(PROFILE(profile.app), JSON.stringify(profile));
}
