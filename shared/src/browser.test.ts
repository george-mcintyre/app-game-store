import { describe, expect, it } from "vitest";
import { profileBrowser } from "./browser.js";

const ios = (tail: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}`;

describe("which browser can install a configuration profile", () => {
  it("accepts Safari, including iPad Safari that reports itself as a Mac", () => {
    expect(profileBrowser(ios("Version/18.1 Mobile/15E148 Safari/604.1"))).toEqual({ safari: true, name: "Safari" });
    expect(profileBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15").safari).toBe(true);
  });

  it("names the browsers that cannot", () => {
    expect(profileBrowser(ios("CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1"))).toEqual({ safari: false, name: "Chrome" });
    expect(profileBrowser(ios("FxiOS/131.0 Mobile/15E148 Safari/605.1.15")).name).toBe("Firefox");
    expect(profileBrowser(ios("EdgiOS/130.0 Version/18.0 Mobile/15E148 Safari/604.1")).name).toBe("Edge");
    expect(profileBrowser(ios("Mobile/15E148 Instagram 350.0.0.0")).name).toBe("Instagram");
    expect(profileBrowser(ios("Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).name).toBe("Facebook");
    expect(profileBrowser(ios("Version/18.1 Mobile/15E148 GSA/340.0 Safari/604.1")).name).toBe("the Google app");
    expect(profileBrowser(ios("Mobile/15E148"))).toEqual({ safari: false, name: "this browser" });
  });
});
