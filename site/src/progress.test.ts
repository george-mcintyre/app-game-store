import { describe, expect, it } from "vitest";
import { HOLD_AT, buildFraction, timeLeft, usualTime } from "./progress.js";

describe("build progress", () => {
  it("fills over the expected time and holds near the end", () => {
    expect(buildFraction(0, 660)).toBe(0);
    expect(buildFraction(330, 660)).toBeCloseTo(HOLD_AT / 2);
    expect(buildFraction(660, 660)).toBe(HOLD_AT);
    expect(buildFraction(5000, 660)).toBe(HOLD_AT);
    expect(buildFraction(-5, 660)).toBe(0);
  });

  it("says how long is left in plain words", () => {
    expect(timeLeft(0, 660)).toBe("About 11 minutes left");
    expect(timeLeft(600, 660)).toBe("About a minute left");
    expect(timeLeft(700, 660)).toMatch(/^Taking longer than usual/);
    expect(usualTime(null)).toBe("A first build can take up to 20 minutes.");
    expect(usualTime(600)).toBe("Builds of this app usually take about 10 minutes.");
    expect(usualTime(50)).toBe("Builds of this app usually take about 1 minute.");
  });
});
