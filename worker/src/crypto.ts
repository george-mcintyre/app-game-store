// Encryption of stored credentials, keyed hashing of tokens, random ids.
//
// Model: one master secret lives only in Worker secrets. Everything derived from it uses HKDF
// with a distinct purpose string, so a developer's data key, the token pepper and the session
// pepper are independent. Credentials are encrypted field by field with AES-256-GCM under a key
// derived per developer, with the developer id, field name and format version bound in as
// additional authenticated data. Every ciphertext records which master key made it, so the
// master key can be rotated with MASTER_KEY_PREVIOUS set while blobs are rewrapped lazily.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SECRET_FORMAT = 2;
export const HASH_PREFIX = "h2:";

export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function toBase64url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array {
  return fromBase64(text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4));
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Short public name of a master key, stored next to ciphertexts so rotation can tell them apart.
export async function keyId(masterKey: string): Promise<string> {
  return (await sha256Hex(`ourapps-kid:${masterKey}`)).slice(0, 12);
}

async function hkdfBase(masterKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(masterKey), "HKDF", false, ["deriveKey", "deriveBits"]);
}

// One AES-GCM key per developer and format version.
async function developerKey(masterKey: string, developerId: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(`ourapps-dev:${developerId}`), info: encoder.encode(`ourapps-developer-secrets-v${SECRET_FORMAT}`) },
    await hkdfBase(masterKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Sealed {
  iv: string;
  ct: string;
}

export async function sealField(masterKey: string, developerId: string, field: string, value: string): Promise<Sealed> {
  const key = await developerKey(masterKey, developerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`${SECRET_FORMAT}|${developerId}|${field}`);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, encoder.encode(value));
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function openField(masterKey: string, developerId: string, field: string, sealed: Sealed): Promise<string> {
  const key = await developerKey(masterKey, developerId);
  const aad = encoder.encode(`${SECRET_FORMAT}|${developerId}|${field}`);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: aad }, key, fromBase64(sealed.ct));
  return decoder.decode(plain);
}

// Format 1 (whole JSON object, no AAD); read only, for upgrade.
export async function openLegacyBlob<T>(masterKey: string, developerId: string, blob: string): Promise<T> {
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(developerId), info: encoder.encode("ourapps-developer-secrets") },
    await hkdfBase(masterKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const bytes = fromBase64(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(decoder.decode(plain)) as T;
}

// Keyed hash for tokens stored in the database: without the master secret a stolen table
// cannot be used to forge or verify tokens.
export async function pepperedHash(masterKey: string, purpose: string, value: string): Promise<string> {
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("ourapps-pepper"), info: encoder.encode(`ourapps-hash:${purpose}`) },
    await hkdfBase(masterKey),
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  return HASH_PREFIX + hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export interface MasterKeys {
  current?: string;
  previous?: string | null;
}

// Hash a token for storage under the current master key; plain SHA-256 when no master key is set.
export async function tokenHash(keys: MasterKeys, purpose: string, value: string): Promise<string> {
  return keys.current ? pepperedHash(keys.current, purpose, value) : sha256Hex(value);
}

// Every hash a stored token might currently be under: current key, previous key, plain SHA-256.
export async function tokenHashCandidates(keys: MasterKeys, purpose: string, value: string): Promise<string[]> {
  const out: string[] = [];
  if (keys.current) out.push(await pepperedHash(keys.current, purpose, value));
  if (keys.previous) out.push(await pepperedHash(keys.previous, purpose, value));
  out.push(await sha256Hex(value));
  return out;
}

// True when a stored hash matches a presented value. "rewrite" is set when the row should be
// rehashed under the current key: it was plain SHA-256 or made with the previous master key.
export async function hashMatches(keys: MasterKeys, purpose: string, value: string, stored: string): Promise<{ ok: boolean; rewrite: boolean }> {
  const candidates = await tokenHashCandidates(keys, purpose, value);
  for (let i = 0; i < candidates.length; i++) {
    if (timingSafeEqual(candidates[i], stored)) return { ok: true, rewrite: i > 0 && Boolean(keys.current) };
  }
  return { ok: false, rewrite: false };
}

// Confirms a PEM private key is an EC P-256 PKCS#8 key, which is what Apple issues.
export async function validateAppleKey(pem: string): Promise<boolean> {
  try {
    const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
    await crypto.subtle.importKey("pkcs8", fromBase64(body), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return true;
  } catch {
    return false;
  }
}

// Confirms a PEM private key is a 2048-bit RSA PKCS#8 key, the kind Apple certifies for signing.
export async function validateSigningKey(pem: string): Promise<boolean> {
  try {
    if (!/^-----BEGIN PRIVATE KEY-----[A-Za-z0-9+/=\s]+-----END PRIVATE KEY-----$/.test(pem.trim())) return false;
    const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
    const key = await crypto.subtle.importKey("pkcs8", fromBase64(body), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]);
    return (key.algorithm as { modulusLength?: number }).modulusLength === 2048;
  } catch {
    return false;
  }
}
