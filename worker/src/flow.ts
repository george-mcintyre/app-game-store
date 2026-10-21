// Signed download links and the App Store Connect client for a developer.
import type { AppManifest } from "@my/store-shared";
import { AppleClient } from "./apple.js";
import type { DeveloperSecrets } from "./db.js";
import type { Deps, Env } from "./env.js";
import { HttpError } from "./http.js";
import { linkExpiry, signLink, type LinkPayload } from "./links.js";
import { appleReady } from "./secrets.js";

export async function dlUrl(env: Env, deps: Deps, link: Omit<LinkPayload, "exp">): Promise<string> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const token = await signLink(env.LINK_SECRET, { ...link, exp: linkExpiry(deps.now()) });
  return `${env.PUBLIC_ORIGIN}/dl/${token}`;
}

// Replace the APK URL in a manifest with a signed worker link.
export async function signManifestLinks(env: Env, deps: Deps, developerId: string, manifest: AppManifest): Promise<AppManifest> {
  const out: AppManifest = structuredClone(manifest);
  if (out.install.android) out.install.android.apk = await dlUrl(env, deps, { url: manifest.install.android!.apk, kind: "apk", dev: developerId });
  return out;
}

export function appleClient(env: Env, deps: Deps, secrets: DeveloperSecrets): AppleClient {
  if (!appleReady(secrets)) throw new HttpError(409, "add your App Store Connect API key in account settings first");
  return new AppleClient(env, deps, { issuerId: secrets.appleIssuerId!, keyId: secrets.appleKeyId!, privateKey: secrets.applePrivateKey! });
}
