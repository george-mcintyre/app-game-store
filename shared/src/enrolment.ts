// Enrolment state machine shared by the worker and the wait page.

export const ENROLMENT_STATES = [
  "awaiting-device",
  "pending-approval",
  "registering",
  "building",
  "ready",
  "rejected",
  "failed",
] as const;

export type EnrolmentState = (typeof ENROLMENT_STATES)[number];

export const FINAL_STATES: ReadonlySet<EnrolmentState> = new Set(["ready", "rejected", "failed"]);

const TRANSITIONS: Record<EnrolmentState, readonly EnrolmentState[]> = {
  "awaiting-device": ["pending-approval", "rejected"],
  "pending-approval": ["registering", "rejected"],
  registering: ["building", "failed"],
  building: ["ready", "failed", "registering"],
  ready: [],
  rejected: [],
  failed: ["registering"],
};

export function canTransition(from: EnrolmentState, to: EnrolmentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinal(state: EnrolmentState): boolean {
  return FINAL_STATES.has(state);
}

export function isEnrolmentState(value: unknown): value is EnrolmentState {
  return typeof value === "string" && (ENROLMENT_STATES as readonly string[]).includes(value);
}

// What the status endpoint returns to the wait page.
export interface EnrolmentStatus {
  id: string;
  state: EnrolmentState;
  app: string;
  linkId: string;
  manifestUrl?: string;
  message?: string;
  updatedAt: string;
  // While registering or building: seconds since the rebuild was asked for, and how long it should take.
  build?: { elapsedSeconds: number; expectedSeconds: number; typicalSeconds: number | null };
  // Once ready: the latest install attempt from a share page and the version last installed.
  install?: { attemptAt: string | null; phase: InstallPhase; version: string | null };
}

// requested: iOS fetched the manifest for its prompt; downloading: the friend tapped Install;
// installed: the download finished.
export type InstallPhase = "none" | "requested" | "downloading" | "installed";
