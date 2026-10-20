// Typed D1 access. Rows are snake_case in SQL and camelCase in code.
import type { EnrolmentState, ScreenshotPlatform } from "@my/store-shared";
import type { Env } from "./env.js";

export interface Developer {
  id: string;
  githubId: number;
  githubLogin: string;
  slug: string;
  displayName: string;
  createdAt: string;
  termsAcceptedVersion: string | null;
  termsAcceptedAt: string | null;
}

export interface DeveloperSecrets {
  appleIssuerId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  appleTeamId?: string;
  githubToken?: string;
  // PKCS #8 PEM of ourapps' Apple Distribution certificate for this developer.
  signingKey?: string;
  // When each field was last saved, keyed by field name.
  savedAt?: Partial<Record<"appleIssuerId" | "appleKeyId" | "applePrivateKey" | "appleTeamId" | "githubToken" | "signingKey", string>>;
}

// The Apple Distribution certificate ourapps created; its private key is the signingKey secret.
export interface SigningCertificateRow {
  developerId: string;
  certificateId: string;
  name: string;
  serialNumber: string;
  certificateBase64: string;
  expirationDate: string | null;
  createdAt: string;
}

export interface AppRow {
  id: string;
  developerId: string;
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
  screenshotsByPlatform: Partial<Record<ScreenshotPlatform, string[]>>;
  repo: string;
  manifestUrl: string;
  profileName: string;
  bundleId: string;
  showOnPage: boolean;
  buildTokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkRow {
  id: string;
  appId: string;
  developerId: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface EnrolmentRow {
  id: string;
  appId: string;
  developerId: string;
  linkId: string;
  name: string;
  state: EnrolmentState;
  udid: string | null;
  product: string | null;
  appleDeviceId: string | null;
  profileUuid: string | null;
  manifestUrl: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  // When the registration profile was last downloaded, and by which browser.
  profileFetchedAt?: string | null;
  profileBrowser?: string | null;
  // The latest install from a share page: iOS fetched the manifest, then the .ipa began and finished.
  installAttemptAt?: string | null;
  installStartedAt?: string | null;
  installDoneAt?: string | null;
  installedVersion?: string | null;
}

export type KeyScope = "read" | "manage";

export interface ApiKeyRow {
  id: string;
  developerId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scope: KeyScope;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditRow {
  id: number;
  developerId: string;
  event: string;
  detail: string;
  country: string | null;
  createdAt: string;
}

export interface ProfileRow {
  appId: string;
  uuid: string;
  profileId: string;
  profileName: string;
  profileBase64: string;
  udids: string[];
  expirationDate: string | null;
  createdAt: string;
}

type Raw = Record<string, unknown>;

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function row<T>(raw: Raw | null, convert: (r: Raw) => Raw = (r) => r): T | null {
  if (!raw) return null;
  const out: Raw = {};
  for (const [k, v] of Object.entries(raw)) out[camel(k)] = v;
  return convert(out) as T;
}

const appConvert = (r: Raw): Raw => ({
  ...r,
  screenshots: JSON.parse(r.screenshots as string),
  screenshotsByPlatform: JSON.parse((r.screenshotsByPlatform as string | undefined) ?? "{}"),
  showOnPage: r.showOnPage === 1,
});
const profileConvert = (r: Raw): Raw => ({ ...r, udids: JSON.parse(r.udids as string) });

export class Db {
  constructor(private d1: D1Database) {}

  static from(env: Env): Db {
    return new Db(env.DB);
  }

  // Developers

  async developerById(id: string): Promise<Developer | null> {
    return row<Developer>(await this.d1.prepare("SELECT * FROM developers WHERE id = ?").bind(id).first());
  }

  async developerByGithubId(githubId: number): Promise<Developer | null> {
    return row<Developer>(await this.d1.prepare("SELECT * FROM developers WHERE github_id = ?").bind(githubId).first());
  }

  async developerBySlug(slug: string): Promise<Developer | null> {
    return row<Developer>(await this.d1.prepare("SELECT * FROM developers WHERE slug = ?").bind(slug).first());
  }

  async insertDeveloper(dev: Developer): Promise<void> {
    await this.d1
      .prepare("INSERT INTO developers (id, github_id, github_login, slug, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(dev.id, dev.githubId, dev.githubLogin, dev.slug, dev.displayName, dev.createdAt)
      .run();
  }

  async updateDeveloper(id: string, slug: string, displayName: string): Promise<void> {
    await this.d1.prepare("UPDATE developers SET slug = ?, display_name = ? WHERE id = ?").bind(slug, displayName, id).run();
  }

  async acceptTerms(id: string, version: string, now: string): Promise<void> {
    await this.d1.prepare("UPDATE developers SET terms_accepted_version = ?, terms_accepted_at = ? WHERE id = ?").bind(version, now, id).run();
  }

  // Removes the developer and, through cascades, their secrets, sessions, keys, apps, links, devices and profiles.
  async deleteDeveloper(id: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("DELETE FROM audit_log WHERE developer_id = ?").bind(id),
      this.d1.prepare("DELETE FROM links WHERE developer_id = ?").bind(id),
      this.d1.prepare("DELETE FROM enrolments WHERE developer_id = ?").bind(id),
      this.d1.prepare("DELETE FROM developers WHERE id = ?").bind(id),
    ]);
  }

  async secretsBlob(developerId: string): Promise<string | null> {
    const r = await this.d1.prepare("SELECT blob FROM developer_secrets WHERE developer_id = ?").bind(developerId).first<{ blob: string }>();
    return r?.blob ?? null;
  }

  async putSecretsBlob(developerId: string, blob: string, now: string): Promise<void> {
    await this.d1
      .prepare("INSERT INTO developer_secrets (developer_id, blob, updated_at) VALUES (?, ?, ?) ON CONFLICT(developer_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at")
      .bind(developerId, blob, now)
      .run();
  }

  // Sessions

  async insertSession(id: string, developerId: string, expiresAt: string): Promise<void> {
    await this.d1.prepare("INSERT INTO sessions (id, developer_id, expires_at) VALUES (?, ?, ?)").bind(id, developerId, expiresAt).run();
  }

  async sessionDeveloper(id: string, now: string): Promise<Developer | null> {
    return row<Developer>(
      await this.d1.prepare("SELECT d.* FROM sessions s JOIN developers d ON d.id = s.developer_id WHERE s.id = ? AND s.expires_at > ?").bind(id, now).first(),
    );
  }

  async renameSession(from: string, to: string): Promise<void> {
    await this.d1.prepare("UPDATE sessions SET id = ? WHERE id = ?").bind(to, from).run();
  }

  async deleteSession(id: string): Promise<void> {
    await this.d1.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  }

  async deleteSessionsFor(developerId: string): Promise<number> {
    const res = await this.d1.prepare("DELETE FROM sessions WHERE developer_id = ?").bind(developerId).run();
    return res.meta.changes ?? 0;
  }

  async deleteExpiredSessions(now: string): Promise<void> {
    await this.d1.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  }

  // Apps

  async appById(id: string): Promise<AppRow | null> {
    return row<AppRow>(await this.d1.prepare("SELECT * FROM apps WHERE id = ?").bind(id).first(), appConvert);
  }

  async appsByDeveloper(developerId: string, onlyShown = false): Promise<AppRow[]> {
    const sql = `SELECT * FROM apps WHERE developer_id = ?${onlyShown ? " AND show_on_page = 1" : ""} ORDER BY name`;
    const res = await this.d1.prepare(sql).bind(developerId).all<Raw>();
    return res.results.map((r) => row<AppRow>(r, appConvert)!);
  }

  async insertApp(app: AppRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO apps (id, developer_id, name, tagline, description, whats_new, size, min_os, age_note, privacy_summary, icon_url, screenshots, screenshots_by_platform, repo, manifest_url, profile_name, bundle_id, show_on_page, build_token_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        app.id, app.developerId, app.name, app.tagline, app.description, app.whatsNew, app.size, app.minOs, app.ageNote, app.privacySummary,
        app.iconUrl, JSON.stringify(app.screenshots), JSON.stringify(app.screenshotsByPlatform), app.repo, app.manifestUrl, app.profileName, app.bundleId, app.showOnPage ? 1 : 0, app.buildTokenHash, app.createdAt, app.updatedAt,
      )
      .run();
  }

  async updateApp(app: AppRow): Promise<void> {
    await this.d1
      .prepare(
        `UPDATE apps SET name = ?, tagline = ?, description = ?, whats_new = ?, size = ?, min_os = ?, age_note = ?, privacy_summary = ?, icon_url = ?, screenshots = ?, screenshots_by_platform = ?, repo = ?, manifest_url = ?, profile_name = ?, bundle_id = ?, show_on_page = ?, build_token_hash = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        app.name, app.tagline, app.description, app.whatsNew, app.size, app.minOs, app.ageNote, app.privacySummary, app.iconUrl, JSON.stringify(app.screenshots), JSON.stringify(app.screenshotsByPlatform),
        app.repo, app.manifestUrl, app.profileName, app.bundleId, app.showOnPage ? 1 : 0, app.buildTokenHash, app.updatedAt, app.id,
      )
      .run();
  }

  async rehashBuildToken(id: string, hash: string): Promise<void> {
    await this.d1.prepare("UPDATE apps SET build_token_hash = ? WHERE id = ?").bind(hash, id).run();
  }

  async deleteApp(id: string): Promise<void> {
    await this.d1.prepare("DELETE FROM apps WHERE id = ?").bind(id).run();
  }

  // Links

  async linkById(id: string): Promise<LinkRow | null> {
    return row<LinkRow>(await this.d1.prepare("SELECT * FROM links WHERE id = ?").bind(id).first());
  }

  async linksByApp(appId: string): Promise<LinkRow[]> {
    const res = await this.d1.prepare("SELECT * FROM links WHERE app_id = ? ORDER BY created_at DESC").bind(appId).all<Raw>();
    return res.results.map((r) => row<LinkRow>(r)!);
  }

  async insertLink(link: LinkRow): Promise<void> {
    await this.d1
      .prepare("INSERT INTO links (id, app_id, developer_id, label, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(link.id, link.appId, link.developerId, link.label, link.createdAt, link.expiresAt, link.revokedAt)
      .run();
  }

  async revokeLink(id: string, now: string): Promise<void> {
    await this.d1.prepare("UPDATE links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, id).run();
  }

  async renameLink(id: string, label: string): Promise<void> {
    await this.d1.prepare("UPDATE links SET label = ? WHERE id = ?").bind(label, id).run();
  }

  async deleteLink(id: string): Promise<void> {
    await this.d1.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
  }

  // Enrolments

  async enrolmentById(id: string): Promise<EnrolmentRow | null> {
    return row<EnrolmentRow>(await this.d1.prepare("SELECT * FROM enrolments WHERE id = ?").bind(id).first());
  }

  async enrolmentsByDeveloper(developerId: string): Promise<EnrolmentRow[]> {
    const res = await this.d1.prepare("SELECT * FROM enrolments WHERE developer_id = ? ORDER BY created_at DESC").bind(developerId).all<Raw>();
    return res.results.map((r) => row<EnrolmentRow>(r)!);
  }

  async enrolmentsByApp(appId: string): Promise<EnrolmentRow[]> {
    const res = await this.d1.prepare("SELECT * FROM enrolments WHERE app_id = ? ORDER BY created_at").bind(appId).all<Raw>();
    return res.results.map((r) => row<EnrolmentRow>(r)!);
  }

  async insertEnrolment(e: EnrolmentRow): Promise<void> {
    await this.d1
      .prepare("INSERT INTO enrolments (id, app_id, developer_id, link_id, name, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(e.id, e.appId, e.developerId, e.linkId, e.name, e.state, e.createdAt, e.updatedAt)
      .run();
  }

  async updateEnrolment(e: EnrolmentRow): Promise<void> {
    await this.d1
      .prepare("UPDATE enrolments SET state = ?, udid = ?, product = ?, apple_device_id = ?, profile_uuid = ?, manifest_url = ?, message = ?, updated_at = ? WHERE id = ?")
      .bind(e.state, e.udid, e.product, e.appleDeviceId, e.profileUuid, e.manifestUrl, e.message, e.updatedAt, e.id)
      .run();
  }

  async profileFetched(id: string, at: string, browser: string): Promise<void> {
    await this.d1.prepare("UPDATE enrolments SET profile_fetched_at = ?, profile_browser = ? WHERE id = ?").bind(at, browser, id).run();
  }

  // A new attempt clears the progress of the previous one; the installed version stays until replaced.
  async installAttempt(id: string, at: string): Promise<void> {
    await this.d1.prepare("UPDATE enrolments SET install_attempt_at = ?, install_started_at = NULL, install_done_at = NULL WHERE id = ?").bind(at, id).run();
  }

  async installStarted(id: string, at: string): Promise<void> {
    await this.d1.prepare("UPDATE enrolments SET install_started_at = ? WHERE id = ?").bind(at, id).run();
  }

  async installDone(id: string, at: string, version: string | null): Promise<void> {
    await this.d1.prepare("UPDATE enrolments SET install_done_at = ?, installed_version = COALESCE(?, installed_version) WHERE id = ?").bind(at, version, id).run();
  }

  async deleteEnrolment(id: string): Promise<void> {
    await this.d1.prepare("DELETE FROM enrolments WHERE id = ?").bind(id).run();
  }

  // API keys

  async apiKeyByHash(hashes: string[]): Promise<ApiKeyRow | null> {
    const marks = hashes.map(() => "?").join(", ");
    return row<ApiKeyRow>(await this.d1.prepare(`SELECT * FROM api_keys WHERE key_hash IN (${marks}) AND revoked_at IS NULL`).bind(...hashes).first());
  }

  async rehashApiKey(id: string, hash: string): Promise<void> {
    await this.d1.prepare("UPDATE api_keys SET key_hash = ? WHERE id = ?").bind(hash, id).run();
  }

  async apiKeysByDeveloper(developerId: string): Promise<ApiKeyRow[]> {
    const res = await this.d1.prepare("SELECT * FROM api_keys WHERE developer_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").bind(developerId).all<Raw>();
    return res.results.map((r) => row<ApiKeyRow>(r)!);
  }

  async insertApiKey(k: ApiKeyRow): Promise<void> {
    await this.d1
      .prepare("INSERT INTO api_keys (id, developer_id, name, prefix, key_hash, scope, created_at, expires_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(k.id, k.developerId, k.name, k.prefix, k.keyHash, k.scope, k.createdAt, k.expiresAt, k.lastUsedAt, k.revokedAt)
      .run();
  }

  async revokeAllApiKeys(developerId: string, now: string): Promise<number> {
    const res = await this.d1.prepare("UPDATE api_keys SET revoked_at = ? WHERE developer_id = ? AND revoked_at IS NULL").bind(now, developerId).run();
    return res.meta.changes ?? 0;
  }

  // Audit log

  async insertAudit(a: Omit<AuditRow, "id">): Promise<void> {
    await this.d1.prepare("INSERT INTO audit_log (developer_id, event, detail, country, created_at) VALUES (?, ?, ?, ?, ?)").bind(a.developerId, a.event, a.detail, a.country, a.createdAt).run();
  }

  async auditFor(developerId: string, limit = 50): Promise<AuditRow[]> {
    const res = await this.d1.prepare("SELECT * FROM audit_log WHERE developer_id = ? ORDER BY id DESC LIMIT ?").bind(developerId, limit).all<Raw>();
    return res.results.map((r) => row<AuditRow>(r)!);
  }

  async touchApiKey(id: string, now: string): Promise<void> {
    await this.d1.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(now, id).run();
  }

  async revokeApiKey(id: string, developerId: string, now: string): Promise<boolean> {
    const res = await this.d1.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND developer_id = ? AND revoked_at IS NULL").bind(now, id, developerId).run();
    return (res.meta.changes ?? 0) > 0;
  }

  // Build durations

  async recentBuildSeconds(appId: string, limit: number): Promise<number[]> {
    const res = await this.d1.prepare("SELECT seconds FROM build_durations WHERE app_id = ? ORDER BY id DESC LIMIT ?").bind(appId, limit).all<{ seconds: number }>();
    return res.results.map((r) => r.seconds);
  }

  // Keeps the ten latest per app.
  async addBuildSeconds(appId: string, seconds: number, now: string): Promise<void> {
    await this.d1.batch([
      this.d1.prepare("INSERT INTO build_durations (app_id, seconds, created_at) VALUES (?, ?, ?)").bind(appId, seconds, now),
      this.d1.prepare("DELETE FROM build_durations WHERE app_id = ? AND id NOT IN (SELECT id FROM build_durations WHERE app_id = ? ORDER BY id DESC LIMIT 10)").bind(appId, appId),
    ]);
  }

  // Signing certificate

  async signingCertificate(developerId: string): Promise<SigningCertificateRow | null> {
    return row<SigningCertificateRow>(await this.d1.prepare("SELECT * FROM signing_certificates WHERE developer_id = ?").bind(developerId).first());
  }

  async putSigningCertificate(c: SigningCertificateRow): Promise<void> {
    await this.d1
      .prepare(
        `INSERT INTO signing_certificates (developer_id, certificate_id, name, serial_number, certificate_base64, expiration_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(developer_id) DO UPDATE SET certificate_id = excluded.certificate_id, name = excluded.name, serial_number = excluded.serial_number,
         certificate_base64 = excluded.certificate_base64, expiration_date = excluded.expiration_date, created_at = excluded.created_at`,
      )
      .bind(c.developerId, c.certificateId, c.name, c.serialNumber, c.certificateBase64, c.expirationDate, c.createdAt)
      .run();
  }

  // Profiles

  async latestProfile(appId: string): Promise<ProfileRow | null> {
    return row<ProfileRow>(await this.d1.prepare("SELECT * FROM profiles WHERE app_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(appId).first(), profileConvert);
  }

  async profileByUuid(appId: string, uuid: string): Promise<ProfileRow | null> {
    return row<ProfileRow>(await this.d1.prepare("SELECT * FROM profiles WHERE app_id = ? AND uuid = ?").bind(appId, uuid).first(), profileConvert);
  }

  async insertProfile(p: ProfileRow): Promise<void> {
    await this.d1
      .prepare("INSERT INTO profiles (app_id, uuid, profile_id, profile_name, profile_base64, udids, expiration_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p.appId, p.uuid, p.profileId, p.profileName, p.profileBase64, JSON.stringify(p.udids), p.expirationDate, p.createdAt)
      .run();
  }
}
