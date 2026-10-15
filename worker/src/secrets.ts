// Read and write a developer's encrypted credentials.
import { decryptForDeveloper, encryptForDeveloper } from "./crypto.js";
import { Db, type DeveloperSecrets } from "./db.js";
import type { Env } from "./env.js";
import { HttpError } from "./http.js";

export async function loadSecrets(env: Env, developerId: string): Promise<DeveloperSecrets> {
  if (!env.MASTER_KEY) throw new HttpError(503, "MASTER_KEY is not configured");
  const blob = await Db.from(env).secretsBlob(developerId);
  if (!blob) return {};
  return decryptForDeveloper<DeveloperSecrets>(env.MASTER_KEY, developerId, blob);
}

export async function saveSecrets(env: Env, developerId: string, secrets: DeveloperSecrets, now: Date): Promise<void> {
  if (!env.MASTER_KEY) throw new HttpError(503, "MASTER_KEY is not configured");
  const blob = await encryptForDeveloper(env.MASTER_KEY, developerId, secrets);
  await Db.from(env).putSecretsBlob(developerId, blob, now.toISOString());
}

export function appleReady(s: DeveloperSecrets): boolean {
  return Boolean(s.appleIssuerId && s.appleKeyId && s.applePrivateKey);
}
