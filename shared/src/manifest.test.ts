import { describe, expect, it } from "vitest";
import { validateManifest } from "./manifest.js";

const valid = {
  schema: 1,
  id: "skull",
  name: "Skull",
  version: "0.1.0",
  description: "Bluffing card game for 3-6 friends on their phones.",
  icon: "https://example.com/icon-512.png",
  minPlayers: 3,
  maxPlayers: 6,
  install: {
    pwa: null,
    android: { apk: "https://example.com/skull.apk" },
    ios: { bundleId: "com.georgemcintyre.skull", adhoc: "https://example.com/ios/manifest.plist", testflight: null },
  },
};

function withPatch(patch: Record<string, unknown>) {
  return { ...structuredClone(valid), ...patch };
}

describe("validateManifest", () => {
  it("accepts the reference manifest", () => {
    const result = validateManifest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.id).toBe("skull");
  });

  it("rejects unknown schema versions", () => {
    const result = validateManifest(withPatch({ schema: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/unsupported schema 2/);
  });

  it("rejects non-objects", () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest("x").ok).toBe(false);
    expect(validateManifest([]).ok).toBe(false);
  });

  it("rejects a bad slug", () => {
    const result = validateManifest(withPatch({ id: "Skull App" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("id must be a lowercase slug");
  });

  it("rejects http icons", () => {
    const result = validateManifest(withPatch({ icon: "http://example.com/icon.png" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("icon must be an https URL");
  });

  it("rejects player counts out of order", () => {
    const result = validateManifest(withPatch({ minPlayers: 6, maxPlayers: 3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("minPlayers must not exceed maxPlayers");
  });

  it("requires at least one install path", () => {
    const result = validateManifest(withPatch({ install: { pwa: null, android: null, ios: null } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("install needs at least one of pwa, android, ios");
  });

  it("requires every install key to be present", () => {
    const result = validateManifest(withPatch({ install: { pwa: "https://example.com/" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/must name pwa, android and ios/);
  });

  it("accepts a pwa-only manifest", () => {
    const result = validateManifest(withPatch({ install: { pwa: "https://example.com/", android: null, ios: null } }));
    expect(result.ok).toBe(true);
  });

  it("requires ios to have adhoc or testflight", () => {
    const result = validateManifest(withPatch({ install: { pwa: null, android: null, ios: { bundleId: "a.b", adhoc: null, testflight: null } } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("install.ios needs adhoc or testflight");
  });

  it("accepts optional screenshots and rejects bad ones", () => {
    expect(validateManifest(withPatch({ screenshots: ["https://example.com/1.png"] })).ok).toBe(true);
    expect(validateManifest(withPatch({ screenshots: [] })).ok).toBe(true);
    const bad = validateManifest(withPatch({ screenshots: ["http://example.com/1.png"] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("screenshots must be a list of https URLs");
    expect(validateManifest(withPatch({ screenshots: "x" })).ok).toBe(false);
  });

  it("collects several errors at once", () => {
    const result = validateManifest(withPatch({ name: "", version: "", icon: "nope" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBe(3);
  });
});
