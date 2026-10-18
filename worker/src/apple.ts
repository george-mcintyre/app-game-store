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

interface Resource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, { data?: { id: string; type: string }[] }>;
}

export class AppleClient {
  constructor(private env: Env, private deps: Deps, private creds: AppleCredentials) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await makeToken(this.creds, this.deps.now());
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

  async findProfileByName(name: string): Promise<Resource<{ name: string; uuid: string; profileContent: string; expirationDate: string }> | null> {
    const res = await this.call<{ data: Resource<{ name: string; uuid: string; profileContent: string; expirationDate: string }>[] }>(
      "GET",
      `/v1/profiles?filter[name]=${encodeURIComponent(name)}&include=bundleId,certificates&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // Profiles are immutable: delete and recreate with the same name, bundle id and certificates.
  async recreateAdHocProfile(name: string, deviceIds: string[]): Promise<{ id: string; uuid: string; profileContent: string; expirationDate: string }> {
    const old = await this.findProfileByName(name);
    if (!old) throw new Error(`Apple profile "${name}" not found; create it once in the developer portal`);
    const bundleId = old.relationships?.bundleId?.data?.[0];
    const certificates = old.relationships?.certificates?.data ?? [];
    if (!bundleId || certificates.length === 0) throw new Error(`Apple profile "${name}" has no bundle id or certificates in its relationships`);
    await this.call("DELETE", `/v1/profiles/${old.id}`);
    const res = await this.call<{ data: Resource<{ uuid: string; profileContent: string; expirationDate: string }> }>("POST", "/v1/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_ADHOC" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: bundleId.id } },
          certificates: { data: certificates.map((c) => ({ type: "certificates", id: c.id })) },
          devices: { data: deviceIds.map((id) => ({ type: "devices", id })) },
        },
      },
    });
    return { id: res.data.id, ...res.data.attributes };
  }
}

export class AppleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
