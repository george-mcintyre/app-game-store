import { describe, expect, it } from "vitest";
import { cleanNotes, parseChangelog, releaseTitle, versionLabel } from "../src/history.js";

describe("versionLabel", () => {
  it("finds the version in tags and names", () => {
    expect(versionLabel("release-0.1.1-4", null)).toBe("0.1.1");
    expect(versionLabel("v1.2.0-beta.1", null)).toBe("1.2.0-beta.1");
    expect(versionLabel("nightly", "Skull 2.0")).toBe("2.0");
    expect(versionLabel("nightly", null)).toBe("nightly");
  });
});

describe("releaseTitle", () => {
  it("drops names that only restate app, version and build", () => {
    expect(releaseTitle("Skull 0.7.2 (build 53)", "release-0.7.2-53", "0.7.2", "Skull")).toBe("");
    expect(releaseTitle("Release 0.1.0", "v0.1.0", "0.1.0", "Skull")).toBe("");
    expect(releaseTitle("v0.1.0", "v0.1.0", "0.1.0", "Skull")).toBe("");
    expect(releaseTitle("First table night", "v0.0.9", "0.0.9", "Skull")).toBe("First table night");
    expect(releaseTitle("Skull 1.0: the big one", "v1.0.0", "1.0", "Skull")).toBe("Skull 1.0: the big one");
  });
});

describe("parseChangelog", () => {
  it("reads Keep a Changelog sections and ignores Unreleased", () => {
    const map = parseChangelog("# Changelog\n\n## [Unreleased]\n- soon\n\n## [1.2.0] - 2026-10-17\n### Added\n- Seat map\n### Fixed\n- Rounding\n\n## v1.1.0 (2026-09-01)\nFirst real one.\n\n## 1.0.0\n");
    expect([...map.keys()]).toEqual(["1.2.0", "1.1.0"]);
    expect(map.get("1.2.0")).toBe("Added:\n- Seat map\nFixed:\n- Rounding");
    expect(map.get("1.1.0")).toBe("First real one.");
  });
});

describe("cleanNotes", () => {
  it("strips GitHub boilerplate and markdown", () => {
    expect(cleanNotes("## What's Changed\n* Thing by @me in https://github.com/o/r/pull/9\n* See [docs](https://x)\n\n**Full Changelog**: https://github.com/o/r/compare/a...b\n")).toBe("What's Changed\n- Thing\n- See docs");
  });
});
