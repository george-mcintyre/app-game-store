// Security-relevant events per developer; never contains secret values.
import { Db } from "./db.js";
import type { Deps, Env } from "./env.js";

export type AuditEvent =
  | "sign-in"
  | "sign-out"
  | "sign-out-everywhere"
  | "credentials-saved"
  | "credentials-removed"
  | "api-key-created"
  | "api-key-revoked"
  | "api-keys-revoked-all"
  | "build-token-rotated"
  | "device-approved"
  | "device-rejected"
  | "app-created"
  | "app-deleted"
  | "terms-accepted";

export async function audit(request: Request | null, env: Env, deps: Deps, developerId: string, event: AuditEvent, detail = ""): Promise<void> {
  const cf = request ? (request as Request & { cf?: { country?: string } }).cf : undefined;
  try {
    await Db.from(env).insertAudit({ developerId, event, detail: detail.slice(0, 200), country: cf?.country ?? null, createdAt: deps.now().toISOString() });
  } catch (err) {
    console.error(`audit write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
