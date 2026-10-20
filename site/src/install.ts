// Installing an iPhone build from a share page, and following it: ourapps sees iOS fetch the
// manifest for its prompt, then the .ipa download start and finish.
import { api } from "./api.js";
import { itmsLink } from "./platform.js";

export type InstallPhase = "none" | "requested" | "downloading" | "installed";
export type InstallInfo = { attemptAt: string | null; phase: InstallPhase; version: string | null };
// What the page has seen of the attempt it started; "nothing" when iOS never asked for the manifest.
export type InstallStep = "waiting" | "nothing" | "requested" | "downloading" | "installed";

// iOS asks for the manifest within a second or two of the tap.
const NOTHING_AFTER_MS = 15_000;
const GIVE_UP_AFTER_MS = 5 * 60_000;

export function installCopy(step: InstallStep, device: string): string {
  switch (step) {
    case "waiting":
    case "requested":
      return `Tap Install when your ${device} asks.`;
    case "nothing":
      return "Nothing happened? This browser may not hand installs to iOS. Open this page in Safari and tap Install again.";
    case "downloading":
      return "Downloading. Keep this page open; it takes a minute or so.";
    case "installed":
      return "Installed. Look for the icon on your home screen.";
  }
}

// The step of this attempt, ignoring the state a previous attempt left behind.
export function stepFor(info: InstallInfo | undefined, before: string | null, elapsedMs: number): InstallStep {
  if (!info || info.attemptAt === before || info.phase === "none") return elapsedMs > NOTHING_AFTER_MS ? "nothing" : "waiting";
  return info.phase;
}

// Opens Apple's installer and reports each step until the download finishes; returns a stop function.
export function startInstall(enrolmentId: string, manifestUrl: string, before: string | null, onStep: (step: InstallStep, version: string | null) => void): () => void {
  let stopped = false;
  const started = Date.now();
  onStep("waiting", null);
  location.href = itmsLink(manifestUrl);
  void (async () => {
    while (!stopped && Date.now() - started < GIVE_UP_AFTER_MS) {
      await new Promise((r) => setTimeout(r, 2000));
      if (stopped) return;
      try {
        const s = await api<{ install?: InstallInfo }>("GET", `/api/enrol/${enrolmentId}/status`);
        const step = stepFor(s.install, before, Date.now() - started);
        onStep(step, s.install?.version ?? null);
        if (step === "installed") return;
      } catch {
        // Offline for a moment; the next poll tries again.
      }
    }
  })();
  return () => (stopped = true);
}
