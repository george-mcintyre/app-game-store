import { describe, expect, it } from "vitest";
import type { Install } from "./api.js";
import { availableViews, chooseView, shapeFor, showTabs } from "./views.js";

const ios = { bundleId: "a.b", adhoc: "https://x/m.plist", testflight: null };
const all: Install = { pwa: "https://w/", android: { apk: "https://x/a.apk" }, ios };
const none = () => false;

describe("availableViews", () => {
  it("lists the versions the release ships", () => {
    expect(availableViews(all, none)).toEqual(["iphone", "android", "web"]);
    expect(availableViews({ pwa: null, android: { apk: "https://x/a.apk" }, ios: null }, none)).toEqual(["android"]);
    expect(availableViews(null, none)).toEqual([]);
  });

  it("uses ios.devices for iPhone and iPad, or iPad screenshots when devices is absent", () => {
    expect(availableViews({ ...all, ios: { ...ios, devices: ["iphone", "ipad"] } }, none)).toEqual(["iphone", "ipad", "android", "web"]);
    expect(availableViews({ ...all, ios: { ...ios, devices: ["ipad"] } }, none)).toEqual(["ipad", "android", "web"]);
    expect(availableViews(all, (v) => v === "ipad")).toEqual(["iphone", "ipad", "android", "web"]);
  });
});

describe("chooseView", () => {
  const views = ["iphone", "ipad", "android", "web"] as const;
  it("matches the device", () => {
    expect(chooseView([...views], "ios", "iPhone")).toBe("iphone");
    expect(chooseView([...views], "ios", "iPad")).toBe("ipad");
    expect(chooseView([...views], "android", "iPhone")).toBe("android");
    expect(chooseView([...views], "other", "iPhone")).toBe("web");
  });

  it("falls back sensibly", () => {
    expect(chooseView(["iphone", "android"], "ios", "iPad")).toBe("iphone");
    expect(chooseView(["ipad", "web"], "ios", "iPhone")).toBe("web");
    expect(chooseView(["android", "web"], "ios", "iPhone")).toBe("web");
    expect(chooseView(["android"], "ios", "iPhone")).toBeNull();
    expect(chooseView(["iphone", "android"], "other", "iPhone")).toBe("iphone");
    expect(chooseView([], "other", "iPhone")).toBeNull();
  });
});

describe("tabs and shapes", () => {
  it("shows tabs only on undetected devices with several versions", () => {
    expect(showTabs("other", ["iphone", "web"])).toBe(true);
    expect(showTabs("other", ["web"])).toBe(false);
    expect(showTabs("ios", ["iphone", "web"])).toBe(false);
  });

  it("gives each version its screenshot shape", () => {
    expect([shapeFor("iphone"), shapeFor("android"), shapeFor("ipad"), shapeFor("web"), shapeFor(null)]).toEqual(["phone", "phone", "tablet", "desktop", "phone"]);
  });
});
