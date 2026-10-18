import { describe, expect, it } from "vitest";
import { appleTargets, deviceNote } from "./pages/public.js";

describe("install.ios.devices on the page", () => {
  it("names the targets, or makes no claim", () => {
    expect(appleTargets(["iphone", "ipad"])).toBe("iPhone and iPad");
    expect(appleTargets(["iphone"])).toBe("iPhone");
    expect(appleTargets(["ipad"])).toBe("iPad");
    expect(appleTargets(undefined)).toBe("iOS");
  });

  it("warns only on the device a build was not made for", () => {
    expect(deviceNote(["iphone"], "iPad")).toMatch(/phone-sized window/);
    expect(deviceNote(["ipad"], "iPhone")).toMatch(/will not install on an iPhone/);
    expect(deviceNote(["iphone", "ipad"], "iPad")).toBe("");
    expect(deviceNote(["iphone"], "iPhone")).toBe("");
    expect(deviceNote(undefined, "iPad")).toBe("");
  });
});
