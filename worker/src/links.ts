// Short-lived signed links for artefacts served through /dl/<token>.

const encoder = new TextEncoder();

export const LINK_TTL_SECONDS = 60 * 60;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface LinkPayload {
  url: string;
  kind: "apk" | "manifest" | "ipa";
  exp: number;
}

export async function signLink(secret: string, payload: LinkPayload): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(sig))}`;
}

export async function verifyLink(secret: string, token: string, now: Date): Promise<LinkPayload | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(sig), encoder.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: LinkPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  } catch {
    return null;
  }
  if (typeof payload.url !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < now.getTime()) return null;
  return payload;
}

export function linkExpiry(now: Date): number {
  return Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS;
}
