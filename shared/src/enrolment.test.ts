import { describe, expect, it } from "vitest";
import { ENROLMENT_STATES, canTransition, isEnrolmentState, isFinal } from "./enrolment.js";

describe("enrolment state machine", () => {
  it("follows the happy path", () => {
    expect(canTransition("awaiting-device", "pending-approval")).toBe(true);
    expect(canTransition("pending-approval", "registering")).toBe(true);
    expect(canTransition("registering", "building")).toBe(true);
    expect(canTransition("building", "ready")).toBe(true);
  });

  it("allows rejection before the device is sent to Apple", () => {
    expect(canTransition("awaiting-device", "rejected")).toBe(true);
    expect(canTransition("pending-approval", "rejected")).toBe(true);
    expect(canTransition("registering", "rejected")).toBe(false);
    expect(canTransition("building", "rejected")).toBe(false);
  });

  it("allows retry after failure and re-dispatch while building", () => {
    expect(canTransition("failed", "registering")).toBe(true);
    expect(canTransition("building", "registering")).toBe(true);
  });

  it("never leaves a final state except failed", () => {
    for (const to of ENROLMENT_STATES) {
      expect(canTransition("ready", to)).toBe(false);
      expect(canTransition("rejected", to)).toBe(false);
    }
  });

  it("skips no steps", () => {
    expect(canTransition("awaiting-device", "building")).toBe(false);
    expect(canTransition("awaiting-device", "ready")).toBe(false);
    expect(canTransition("pending-approval", "ready")).toBe(false);
  });

  it("names final states", () => {
    expect(isFinal("ready")).toBe(true);
    expect(isFinal("rejected")).toBe(true);
    expect(isFinal("failed")).toBe(true);
    expect(isFinal("building")).toBe(false);
  });

  it("recognises state strings", () => {
    expect(isEnrolmentState("building")).toBe(true);
    expect(isEnrolmentState("done")).toBe(false);
    expect(isEnrolmentState(3)).toBe(false);
  });
});
