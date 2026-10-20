import { describe, expect, it } from "vitest";
import { installCopy, stepFor } from "./install.js";

describe("install steps", () => {
  it("ignores the previous attempt and notices when nothing happens", () => {
    const old = { attemptAt: "2026-10-20T10:00:00Z", phase: "installed" as const, version: "1.0" };
    expect(stepFor(old, "2026-10-20T10:00:00Z", 2000)).toBe("waiting");
    expect(stepFor(old, "2026-10-20T10:00:00Z", 20_000)).toBe("nothing");
    expect(stepFor(undefined, null, 20_000)).toBe("nothing");
    expect(stepFor({ attemptAt: "2026-10-20T11:00:00Z", phase: "requested", version: "1.0" }, "2026-10-20T10:00:00Z", 3000)).toBe("requested");
    expect(stepFor({ attemptAt: "2026-10-20T11:00:00Z", phase: "downloading", version: "1.0" }, null, 3000)).toBe("downloading");
    expect(stepFor({ attemptAt: "2026-10-20T11:00:00Z", phase: "installed", version: "1.1" }, null, 3000)).toBe("installed");
  });

  it("says what to do at each step", () => {
    expect(installCopy("requested", "iPhone")).toBe("Tap Install when your iPhone asks.");
    expect(installCopy("nothing", "iPad")).toMatch(/Open this page in Safari/);
    expect(installCopy("installed", "iPhone")).toMatch(/^Installed/);
  });
});
