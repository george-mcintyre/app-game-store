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

  // An Apple Distribution certificate signs Ad Hoc builds for iPhone and iPad.
  async createDistributionCertificate(csrPem: string): Promise<{ id: string; name: string; serialNumber: string; certificateContent: string; expirationDate: string | null }> {
    const res = await this.call<{ data: Resource<{ name: string; serialNumber: string; certificateContent: string; expirationDate?: string }> }>("POST", "/v1/certificates", {
      data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: csrPem } },
    });
    const a = res.data.attributes;
    return { id: res.data.id, name: a.name, serialNumber: a.serialNumber, certificateContent: a.certificateContent, expirationDate: a.expirationDate ?? null };
  }
}

export class AppleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
