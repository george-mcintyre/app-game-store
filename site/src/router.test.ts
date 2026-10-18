import { describe, expect, it } from "vitest";
import { matchRoute } from "./router.js";

describe("matchRoute", () => {
  it("maps every page", () => {
    expect(matchRoute("/")).toEqual({ page: "landing" });
    expect(matchRoute("/george")).toEqual({ page: "dev-page", slug: "george" });
    expect(matchRoute("/l/abc123")).toEqual({ page: "install", linkId: "abc123" });
    expect(matchRoute("/l/abc123/wait/e1")).toEqual({ page: "wait", linkId: "abc123", enrolmentId: "e1" });
    expect(matchRoute("/dev")).toEqual({ page: "dashboard" });
    expect(matchRoute("/dev/apps/new")).toEqual({ page: "app-new" });
    expect(matchRoute("/dev/apps/a1")).toEqual({ page: "app-edit", appId: "a1" });
    expect(matchRoute("/dev/apps/a1/links")).toEqual({ page: "app-links", appId: "a1" });
    expect(matchRoute("/dev/apps")).toEqual({ page: "apps" });
    expect(matchRoute("/dev/apps/a1/preview")).toEqual({ page: "app-preview", appId: "a1" });
    expect(matchRoute("/dev/devices")).toEqual({ page: "devices" });
    expect(matchRoute("/dev/settings")).toEqual({ page: "settings" });
    expect(matchRoute("/dev/guide")).toEqual({ page: "guide" });
    expect(matchRoute("/dev/agents")).toEqual({ page: "agents" });
    expect(matchRoute("/example")).toEqual({ page: "example" });
    expect(matchRoute("/terms")).toEqual({ page: "terms" });
    expect(matchRoute("/reference")).toEqual({ page: "reference" });
    expect(matchRoute("/example/poker-night")).toEqual({ page: "example-app" });
  });

  it("rejects everything else", () => {
    expect(matchRoute("/l")).toEqual({ page: "not-found" });
    expect(matchRoute("/l/a/b")).toEqual({ page: "not-found" });
    expect(matchRoute("/dev/other")).toEqual({ page: "not-found" });
    expect(matchRoute("/George")).toEqual({ page: "not-found" });
    expect(matchRoute("/a/b")).toEqual({ page: "not-found" });
    expect(matchRoute("/example/other")).toEqual({ page: "not-found" });
  });
});
