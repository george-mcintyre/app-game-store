// App Store Connect API: ES256 tokens, device registration, Ad Hoc profile recreation.
import type { Deps, Env } from "./env.js";

export interface AppleCredentials {
  issuerId: string;
  keyId: string;
  privateKey: string;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

// Token lifetime stays under Apple's 20 minute ceiling.
export async function makeToken(creds: AppleCredentials, now: Date): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(creds.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: "ES256", kid: creds.keyId, typ: "JWT" })));
  const payload = base64url(encoder.encode(JSON.stringify({ iss: creds.issuerId, iat, exp: iat + 10 * 60, aud: "appstoreconnect-v1" })));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

interface Linkage {
  id: string;
  type: string;
}

const asList = (data: Linkage | Linkage[] | undefined): Linkage[] => (data === undefined ? [] : Array.isArray(data) ? data : [data]);

interface Resource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  // To-one relationships (bundleId) carry one object; to-many (certificates, devices) an array.
  relationships?: Record<string, { data?: Linkage | Linkage[] }>;
}

export class AppleClient {
  // One token serves every call in a request, keeping CPU time inside the Workers free plan.
  private token: { value: string; until: number } | null = null;

  constructor(private env: Env, private deps: Deps, private creds: AppleCredentials) {}

  private async bearer(): Promise<string> {
    const now = this.deps.now();
    if (!this.token || now.getTime() > this.token.until) this.token = { value: await makeToken(this.creds, now), until: now.getTime() + 5 * 60_000 };
    return this.token.value;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.bearer();
    const res = await this.deps.fetch(`${this.env.APPLE_API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as T & { errors?: { detail?: string; title?: string }[] };
    if (!res.ok) {
      const detail = json.errors?.map((e) => e.detail ?? e.title).join("; ") ?? res.statusText;
      throw new AppleError(res.status, `${method} ${path}: ${detail}`);
    }
    return json;
  }

  async findDevice(udid: string): Promise<Resource | null> {
    const res = await this.call<{ data: Resource[] }>("GET", `/v1/devices?filter[udid]=${encodeURIComponent(udid)}&limit=1`);
    return res.data[0] ?? null;
  }

  // Returns the Apple device id, registering the device when it is new.
  async registerDevice(udid: string, name: string): Promise<string> {
    const existing = await this.findDevice(udid);
    if (existing) return existing.id;
    const res = await this.call<{ data: Resource }>("POST", "/v1/devices", {
      data: { type: "devices", attributes: { name: name.slice(0, 50), udid, platform: "IOS" } },
    });
    return res.data.id;
  }

  // Every enabled iOS-platform device (iPhone, iPad, iPod touch), following Apple's pages of 200.
  async listEnabledIosDevices(): Promise<Resource<{ udid: string }>[]> {
    const out: Resource<{ udid: string }>[] = [];
    let path: string | null = "/v1/devices?filter[platform]=IOS&filter[status]=ENABLED&limit=200";
    for (let page = 0; path !== null && page < 10; page++) {
      const res: { data: Resource<{ udid: string }>[]; links?: { next?: string } } = await this.call("GET", path);
      out.push(...res.data);
      const next = res.links?.next;
      path = next && next.startsWith(this.env.APPLE_API_BASE) ? next.slice(this.env.APPLE_API_BASE.length) : null;
    }
    return out;
  }

  // Exact name match; Apple's name filter is not guaranteed to be exact.
  async findProfileByName(name: string): Promise<Resource<{ name: string; uuid: string; profileContent: string; expirationDate: string }> | null> {
    const res = await this.call<{ data: Resource<{ name: string; uuid: string; profileContent: string; expirationDate: string }>[] }>(
      "GET",
      `/v1/profiles?filter[name]=${encodeURIComponent(name)}&include=bundleId,certificates&limit=200`,
    );
    return res.data.find((p) => p.attributes.name === name) ?? null;
  }

  // Profiles are immutable: delete any profile of that name and create it again. The bundle id and
  // certificate come from `use` when given, else from the profile being replaced.
  async recreateAdHocProfile(
    name: string,
    deviceIds: string[],
    use: { bundleId?: string; certificateId?: string } = {},
  ): Promise<{ id: string; uuid: string; profileContent: string; expirationDate: string }> {
    if (deviceIds.length === 0) throw new Error("Apple makes an Ad Hoc profile only once at least one iPhone or iPad is registered; it is made when you approve the first device");
    const old = await this.findProfileByName(name);
    const bundleId = use.bundleId ?? asList(old?.relationships?.bundleId?.data)[0]?.id;
    const certificates = use.certificateId ? [use.certificateId] : asList(old?.relationships?.certificates?.data).map((c) => c.id);
    if (!bundleId || certificates.length === 0) {
      throw new Error(
        old
          ? `Apple profile "${name}" has no bundle id or certificates in its relationships`
          : `Apple profile "${name}" not found; set up iPhone signing in Settings and give the app its bundle ID`,
      );
    }
    if (old) await this.call("DELETE", `/v1/profiles/${old.id}`);
    const res = await this.call<{ data: Resource<{ uuid: string; profileContent: string; expirationDate: string }> }>("POST", "/v1/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_ADHOC" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundleId } },
          certificates: { data: certificates.map((id) => ({ type: "certificates", id })) },
          devices: { data: deviceIds.map((id) => ({ type: "devices", id })) },
        },
      },
    });
    return { id: res.data.id, ...res.data.attributes };
  }

  // Returns Apple's id for an explicit App ID, creating it when it does not exist yet.
  async ensureBundleId(identifier: string, appName: string): Promise<string> {
    const res = await this.call<{ data: Resource<{ identifier: string }>[] }>("GET", `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=200`);
    const found = res.data.find((b) => b.attributes.identifier === identifier);
    if (found) return found.id;
    const name = `ourapps ${appName}`.replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const created = await this.call<{ data: Resource }>("POST", "/v1/bundleIds", {
      data: { type: "bundleIds", attributes: { identifier, name, platform: "IOS" } },
    });
    return created.data.id;
  }

  // TestFlight

  // The App Store Connect app for a bundle ID. Apple has no API to create one; the developer adds it once.
  async findStoreApp(bundleId: string): Promise<{ id: string; name: string } | null> {
    const res = await this.call<{ data: Resource<{ bundleId: string; name: string }>[] }>("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=200`);
    const app = res.data.find((a) => a.attributes.bundleId === bundleId);
    return app ? { id: app.id, name: app.attributes.name } : null;
  }

  // An App Store profile (no device list) for TestFlight builds, made again when it lacks the certificate.
  async ensureStoreProfile(name: string, bundleIdRes: string, certificateId: string): Promise<{ id: string; uuid: string; profileContent: string; expirationDate: string }> {
    const old = await this.findProfileByName(name);
    const certs = asList(old?.relationships?.certificates?.data).map((c) => c.id);
    const attrs = old?.attributes as { profileType?: string; profileState?: string } | undefined;
    if (old && certs.includes(certificateId) && attrs?.profileType === "IOS_APP_STORE" && attrs?.profileState !== "INVALID") {
      return { id: old.id, uuid: old.attributes.uuid, profileContent: old.attributes.profileContent, expirationDate: old.attributes.expirationDate };
    }
    if (old) await this.call("DELETE", `/v1/profiles/${old.id}`);
    const res = await this.call<{ data: Resource<{ uuid: string; profileContent: string; expirationDate: string }> }>("POST", "/v1/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_STORE" },
        relationships: { bundleId: { data: { type: "bundleIds", id: bundleIdRes } }, certificates: { data: [{ type: "certificates", id: certificateId }] } },
      },
    });
    return { id: res.data.id, ...res.data.attributes };
  }

  // The external beta group friends join through its public link; created with the link switched on.
  async ensureBetaGroup(storeAppId: string, name: string): Promise<{ id: string; publicLink: string | null }> {
    const res = await this.call<{ data: Resource<{ name: string; isInternalGroup: boolean; publicLinkEnabled: boolean; publicLink: string | null }>[] }>("GET", `/v1/apps/${storeAppId}/betaGroups?limit=200`);
    let group = res.data.find((g) => g.attributes.name === name && !g.attributes.isInternalGroup);
    if (!group) {
      const made = await this.call<{ data: Resource<{ name: string; isInternalGroup: boolean; publicLinkEnabled: boolean; publicLink: string | null }> }>("POST", "/v1/betaGroups", {
        data: { type: "betaGroups", attributes: { name, publicLinkEnabled: true, publicLinkLimitEnabled: false, feedbackEnabled: true }, relationships: { app: { data: { type: "apps", id: storeAppId } } } },
      });
      group = made.data;
    } else if (!group.attributes.publicLinkEnabled) {
      const updated = await this.call<{ data: Resource<{ name: string; isInternalGroup: boolean; publicLinkEnabled: boolean; publicLink: string | null }> }>("PATCH", `/v1/betaGroups/${group.id}`, {
        data: { type: "betaGroups", id: group.id, attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: false } },
      });
      group = updated.data;
    }
    return { id: group.id, publicLink: group.attributes.publicLink ?? null };
  }

  async betaGroupLink(groupId: string): Promise<string | null> {
    const res = await this.call<{ data: Resource<{ publicLink: string | null }> }>("GET", `/v1/betaGroups/${groupId}`);
    return res.data.attributes.publicLink ?? null;
  }

  // Who Apple's beta review contacts, and the description testers see; both are required for review.
  async setBetaReviewDetails(storeAppId: string, contact: { firstName: string; lastName: string; email: string; phone: string }, notes: string): Promise<void> {
    const res = await this.call<{ data: Resource }>("GET", `/v1/apps/${storeAppId}/betaAppReviewDetail`);
    await this.call("PATCH", `/v1/betaAppReviewDetails/${res.data.id}`, {
      data: {
        type: "betaAppReviewDetails",
        id: res.data.id,
        attributes: { contactFirstName: contact.firstName, contactLastName: contact.lastName, contactEmail: contact.email, contactPhone: contact.phone, demoAccountRequired: false, notes: notes.slice(0, 4000) },
      },
    });
  }

  async setBetaDescription(storeAppId: string, text: { description: string; feedbackEmail: string }): Promise<void> {
    const res = await this.call<{ data: Resource<{ locale: string }>[] }>("GET", `/v1/apps/${storeAppId}/betaAppLocalizations?limit=50`);
    const attributes = { description: text.description.slice(0, 4000), feedbackEmail: text.feedbackEmail };
    const existing = res.data.find((l) => l.attributes.locale === "en-US") ?? res.data[0];
    if (existing) await this.call("PATCH", `/v1/betaAppLocalizations/${existing.id}`, { data: { type: "betaAppLocalizations", id: existing.id, attributes } });
    else await this.call("POST", "/v1/betaAppLocalizations", { data: { type: "betaAppLocalizations", attributes: { locale: "en-US", ...attributes }, relationships: { app: { data: { type: "apps", id: storeAppId } } } } });
  }

  // Reserves an upload; the workflow sends the bytes straight to Apple with the returned operations.
  async reserveBuildUpload(storeAppId: string, version: string, buildNumber: string, fileName: string, fileSize: number): Promise<{ uploadId: string; fileId: string; operations: UploadOperation[] }> {
    const upload = await this.call<{ data: Resource }>("POST", "/v1/buildUploads", {
      data: { type: "buildUploads", attributes: { cfBundleShortVersionString: version, cfBundleVersion: buildNumber, platform: "IOS" }, relationships: { app: { data: { type: "apps", id: storeAppId } } } },
    });
    const file = await this.call<{ data: Resource<{ uploadOperations?: UploadOperation[] }> }>("POST", "/v1/buildUploadFiles", {
      data: { type: "buildUploadFiles", attributes: { assetType: "ASSET", fileName, fileSize, uti: "com.apple.ipa" }, relationships: { buildUpload: { data: { type: "buildUploads", id: upload.data.id } } } },
    });
    return { uploadId: upload.data.id, fileId: file.data.id, operations: file.data.attributes.uploadOperations ?? [] };
  }

  async commitBuildUpload(fileId: string, md5: string): Promise<void> {
    await this.call("PATCH", `/v1/buildUploadFiles/${fileId}`, {
      data: { type: "buildUploadFiles", id: fileId, attributes: { uploaded: true, sourceFileChecksums: { file: { algorithm: "MD5", hash: md5 } } } },
    });
  }

  async buildUploadState(uploadId: string): Promise<{ state: string; errors: string[] }> {
    const res = await this.call<{ data: Resource<{ state?: { state?: string; errors?: { description?: string; code?: string }[] } }> }>("GET", `/v1/buildUploads/${uploadId}`);
    const st = res.data.attributes.state;
    return { state: st?.state ?? "UNKNOWN", errors: (st?.errors ?? []).map((e) => e.description ?? e.code ?? "error") };
  }

  async findBuild(storeAppId: string, version: string, buildNumber: string): Promise<{ id: string; processingState: string; usesNonExemptEncryption: boolean | null; expirationDate: string | null } | null> {
    const res = await this.call<{ data: Resource<{ processingState: string; usesNonExemptEncryption: boolean | null; expirationDate: string | null }>[] }>(
      "GET",
      `/v1/builds?filter[app]=${storeAppId}&filter[version]=${encodeURIComponent(buildNumber)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=1`,
    );
    const b = res.data[0];
    return b ? { id: b.id, processingState: b.attributes.processingState, usesNonExemptEncryption: b.attributes.usesNonExemptEncryption ?? null, expirationDate: b.attributes.expirationDate ?? null } : null;
  }

  // The newest build that has not expired, to know when the next one is due.
  async latestLiveBuild(storeAppId: string): Promise<{ id: string; expirationDate: string | null } | null> {
    const res = await this.call<{ data: Resource<{ expirationDate: string | null }>[] }>("GET", `/v1/builds?filter[app]=${storeAppId}&filter[expired]=false&sort=-uploadedDate&limit=1`);
    const b = res.data[0];
    return b ? { id: b.id, expirationDate: b.attributes.expirationDate ?? null } : null;
  }

  async addBuildToGroup(groupId: string, buildId: string): Promise<void> {
    await this.call("POST", `/v1/betaGroups/${groupId}/relationships/builds`, { data: [{ type: "builds", id: buildId }] });
  }

  async setWhatsNew(buildId: string, whatsNew: string): Promise<void> {
    const res = await this.call<{ data: Resource<{ locale: string }>[] }>("GET", `/v1/builds/${buildId}/betaBuildLocalizations?limit=50`);
    const existing = res.data[0];
    const attributes = { whatsNew: whatsNew.slice(0, 4000) };
    if (existing) await this.call("PATCH", `/v1/betaBuildLocalizations/${existing.id}`, { data: { type: "betaBuildLocalizations", id: existing.id, attributes } });
    else await this.call("POST", "/v1/betaBuildLocalizations", { data: { type: "betaBuildLocalizations", attributes: { locale: "en-US", ...attributes }, relationships: { build: { data: { type: "builds", id: buildId } } } } });
  }

  async submitForBetaReview(buildId: string): Promise<void> {
    await this.call("POST", "/v1/betaAppReviewSubmissions", { data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: buildId } } } } });
  }

  // An Apple Distribution certificate signs Ad Hoc builds for iPhone and iPad.
  async createDistributionCertificate(csrPem: string): Promise<{ id: string; name: string; serialNumber: string; certificateContent: string; expirationDate: string | null }> {
    const res = await this.call<{ data: Resource<{ name: string; serialNumber: string; certificateContent: string; expirationDate?: string }> }>("POST", "/v1/certificates", {
      data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csrPem } },
    });
    const a = res.data.attributes;
    return { id: res.data.id, name: a.name, serialNumber: a.serialNumber, certificateContent: a.certificateContent, expirationDate: a.expirationDate ?? null };
  }
}

export interface UploadOperation {
  method: string;
  url: string;
  offset: number;
  length: number;
  requestHeaders?: { name: string; value: string }[];
}

export class AppleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
