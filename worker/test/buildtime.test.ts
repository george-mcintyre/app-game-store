import { describe, expect, it } from "vitest";
import { expectedSeconds, median } from "../src/buildtime.js";

describe("build time", () => {
  it("takes the median and adds a tenth, or 20 minutes before the first build", () => {
    expect(median([])).toBeNull();
    expect(median([700, 500, 600])).toBe(600);
    expect(median([500, 700])).toBe(600);
    expect(expectedSeconds(600)).toBe(660);
    expect(expectedSeconds(null)).toBe(1200);
  });
});
