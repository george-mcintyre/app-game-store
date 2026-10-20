import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signingRequest } from "./signing.js";

// Reads one DER element: tag, the whole element and its content.
function element(der: Uint8Array, at: number): { tag: number; whole: Uint8Array; body: Uint8Array; next: number } {
  const tag = der[at];
  let n = der[at + 1];
  let head = 2;
  if (n & 0x80) {
    const count = n & 0x7f;
    n = 0;
    for (let i = 0; i < count; i++) n = (n << 8) | der[at + 2 + i];
    head += count;
  }
  return { tag, whole: der.subarray(at, at + head + n), body: der.subarray(at + head, at + head + n), next: at + head + n };
}

const fromPem = (text: string) => Uint8Array.from(Buffer.from(text.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""), "base64"));

describe("signing request", () => {
  it("is a PKCS #10 request signed by its own 2048-bit RSA key", async () => {
    const { csr, privateKey } = await signingRequest("ourapps test");
    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n[A-Za-z0-9+/=\n]+-----END CERTIFICATE REQUEST-----\n$/);
    expect(privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);

    const der = fromPem(csr);
    const outer = element(der, 0);
    expect(outer.tag).toBe(0x30);
    const info = element(outer.body, 0);
    const algorithm = element(outer.body, info.next);
    const signature = element(outer.body, algorithm.next);
    expect(signature.tag).toBe(0x03);

    // Inside the request info: version 0, subject, then the public key.
    const version = element(info.body, 0);
    expect([...version.whole]).toEqual([0x02, 0x01, 0x00]);
    const subject = element(info.body, version.next);
    expect(Buffer.from(subject.whole).includes(Buffer.from("ourapps test"))).toBe(true);
    const spki = element(info.body, subject.next);
    const publicKey = createPublicKey({ key: Buffer.from(spki.whole), format: "der", type: "spki" });
    expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);

    expect(verify("sha256", info.whole, publicKey, signature.body.subarray(1))).toBe(true);
    const fromKey = createPublicKey(createPrivateKey(privateKey)).export({ format: "der", type: "spki" });
    expect(Buffer.compare(fromKey, Buffer.from(spki.whole))).toBe(0);
  });
});
