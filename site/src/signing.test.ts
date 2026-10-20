import { describe, expect, it } from "vitest";
import { signingRequest } from "./signing.js";

// Reads one DER element: tag, the whole element and its content.
function element(der: Uint8Array, at: number): { tag: number; whole: Uint8Array<ArrayBuffer>; body: Uint8Array<ArrayBuffer>; next: number } {
  const tag = der[at];
  let n = der[at + 1];
  let head = 2;
  if (n & 0x80) {
    const count = n & 0x7f;
    n = 0;
    for (let i = 0; i < count; i++) n = (n << 8) | der[at + 2 + i];
    head += count;
  }
  return { tag, whole: der.slice(at, at + head + n), body: der.slice(at + head, at + head + n), next: at + head + n };
}

const fromPem = (text: string) => Uint8Array.from(atob(text.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

describe("signing request", () => {
  it("is a PKCS #10 request signed by its own 2048-bit RSA key", async () => {
    const { csr, privateKey } = await signingRequest("ourapps test");
    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n[A-Za-z0-9+/=\n]+-----END CERTIFICATE REQUEST-----\n$/);
    expect(privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);

    const outer = element(fromPem(csr), 0);
    expect(outer.tag).toBe(0x30);
    const info = element(outer.body, 0);
    const algorithm = element(outer.body, info.next);
    const signature = element(outer.body, algorithm.next);
    expect(signature.tag).toBe(0x03);

    // Inside the request info: version 0, subject, then the public key.
    const version = element(info.body, 0);
    expect([...version.whole]).toEqual([0x02, 0x01, 0x00]);
    const subject = element(info.body, version.next);
    expect(new TextDecoder().decode(subject.whole)).toContain("ourapps test");
    const spki = element(info.body, subject.next);
    const publicKey = await crypto.subtle.importKey("spki", spki.whole, RSA, true, ["verify"]);
    expect((publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength).toBe(2048);
    expect(await crypto.subtle.verify(RSA, publicKey, signature.body.slice(1), info.whole)).toBe(true);

    // The private key belongs to the public key in the request.
    const priv = await crypto.subtle.exportKey("jwk", await crypto.subtle.importKey("pkcs8", fromPem(privateKey), RSA, true, ["sign"]));
    expect(priv.n).toBe((await crypto.subtle.exportKey("jwk", publicKey)).n);
  });
});
