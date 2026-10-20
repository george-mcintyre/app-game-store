// Shared steps of the enrolment flow: signed links, state changes, Apple registration, rebuild dispatch.
import { canTransition, type AppManifest, type EnrolmentState } from "@my/store-shared";
import { AppleClient } from "./apple.js";
import { Db, type AppRow, type DeveloperSecrets, type EnrolmentRow, type ProfileRow } from "./db.js";
import type { Deps, Env } from "./env.js";
import { dispatchRebuild } from "./github.js";
import { HttpError } from "./http.js";
import { linkExpiry, signLink, type LinkPayload } from "./links.js";
import { appleReady } from "./secrets.js";

export async function dlUrl(env: Env, deps: Deps, link: Omit<LinkPayload, "exp">): Promise<string> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const token = await signLink(env.LINK_SECRET, { ...link, exp: linkExpiry(deps.now()) });
  return `${env.PUBLIC_ORIGIN}/dl/${token}`;
}

// Replace the artefact URLs in a manifest with signed worker links.
export async function signManifestLinks(env: Env, deps: Deps, developerId: string, manifest: AppManifest): Promise<AppManifest> {
  const out: AppManifest = structuredClone(manifest);
  if (out.install.android) out.install.android.apk = await dlUrl(env, deps, { url: manifest.install.android!.apk, kind: "apk", dev: developerId });
  if (out.install.ios?.adhoc) out.install.ios.adhoc = await dlUrl(env, deps, { url: manifest.install.ios!.adhoc!, kind: "manifest", dev: developerId });
  return out;
}

// Replace every <key>url</key><string>...</string> in a manifest.plist.
export async function rewriteManifestUrls(plist: string, replace: (url: string) => Promise<string>): Promise<string> {
  const re = /(<key>url<\/key>\s*<string>)([^<]+)(<\/string>)/g;
  let out = "";
  let last = 0;
  for (const match of plist.matchAll(re)) {
    const [whole, open, value, close] = match;
    out += plist.slice(last, match.index) + open + (await replace(value.trim())) + close;
    last = match.index + whole.length;
  }
  return out + plist.slice(last);
}

export async function transition(env: Env, deps: Deps, record: EnrolmentRow, to: EnrolmentState, patch: Partial<EnrolmentRow> = {}): Promise<void> {
  if (!canTransition(record.state, to)) throw new HttpError(409, `cannot move from ${record.state} to ${to}`);
  Object.assign(record, patch, { state: to, updatedAt: deps.now().toISOString() });
  await Db.from(env).updateEnrolment(record);
}

export function rebuildPayload(env: Env, app: AppRow, record: EnrolmentRow, profile: ProfileRow) {
  return {
    app: app.id,
    enrolmentId: record.id,
    udid: record.udid ?? "",
    deviceName: record.name,
    profileName: profile.profileName,
    profileId: profile.profileId,
    profileUuid: profile.uuid,
    buildReadyUrl: `${env.PUBLIC_ORIGIN}/api/build-ready`,
    profileUrl: `${env.PUBLIC_ORIGIN}/api/build/${app.id}/profile`,
  };
}

export function appleClient(env: Env, deps: Deps, secrets: DeveloperSecrets): AppleClient {
  if (!appleReady(secrets)) throw new HttpError(409, "add your App Store Connect API key in account settings first");
  return new AppleClient(env, deps, { issuerId: secrets.appleIssuerId!, keyId: secrets.appleKeyId!, privateKey: secrets.applePrivateKey! });
}

export const defaultProfileName = (appName: string): string => `${appName.replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() || "App"} Ad Hoc`;

// Makes the app's Ad Hoc profile again with every enabled device, using ourapps' certificate and the
// app's bundle ID when they exist; records it and names it on the app when the name was blank.
export async function refreshProfile(env: Env, deps: Deps, app: AppRow, apple: AppleClient): Promise<ProfileRow> {
  const db = Db.from(env);
  const certificate = await db.signingCertificate(app.developerId);
  const devices = await apple.listEnabledIosDevices();
  const name = app.profileName || defaultProfileName(app.name);
  const created = await apple.recreateAdHocProfile(
    name,
    devices.map((d) => d.id),
    { bundleId: app.bundleId ? await apple.ensureBundleId(app.bundleId, app.name) : undefined, certificateId: certificate?.certificateId },
  );
  const profile: ProfileRow = {
    appId: app.id,
    profileId: created.id,
    profileName: name,
    uuid: created.uuid,
    profileBase64: created.profileContent,
    udids: devices.map((d) => d.attributes.udid),
    expirationDate: created.expirationDate,
    createdAt: deps.now().toISOString(),
  };
  await db.insertProfile(profile);
  if (!app.profileName) {
    app.profileName = name;
    app.updatedAt = profile.createdAt;
    await db.updateApp(app);
  }
  return profile;
}

// Approve: register with Apple, recreate the profile, ask the app repo to rebuild.
export async function approveEnrolment(env: Env, deps: Deps, app: AppRow, secrets: DeveloperSecrets, record: EnrolmentRow): Promise<ProfileRow> {
  if (!record.udid) throw new HttpError(409, "device has not sent its UDID yet");
  if (!canTransition(record.state, "registering")) throw new HttpError(409, `cannot approve from state ${record.state}`);
  const apple = appleClient(env, deps, secrets);
  await transition(env, deps, record, "registering", { message: null });
  try {
    record.appleDeviceId = await apple.registerDevice(record.udid, `${record.name} (${record.product ?? "iPhone"})`);
    const profile = await refreshProfile(env, deps, app, apple);
    await dispatchRebuild(env, deps, secrets.githubToken, app.repo, rebuildPayload(env, app, record, profile));
    await transition(env, deps, record, "building", { profileUuid: profile.uuid });
    return profile;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await transition(env, deps, record, "failed", { message });
    throw new HttpError(502, message);
  }
}
