// The ring fills over the expected build time, then holds here until the build is ready.
export const HOLD_AT = 0.95;

export function buildFraction(elapsed: number, expected: number): number {
  if (expected <= 0) return HOLD_AT;
  return Math.min(Math.max(elapsed / expected, 0), 1) * HOLD_AT;
}

export function timeLeft(elapsed: number, expected: number): string {
  const left = expected - elapsed;
  if (left <= 0) return "Taking longer than usual. It finishes by itself; you can close this page and come back.";
  if (left <= 90) return "About a minute left";
  return `About ${Math.ceil(left / 60)} minutes left`;
}

export function usualTime(typical: number | null): string {
  if (typical === null) return "A first build can take up to 20 minutes.";
  const minutes = Math.max(1, Math.round(typical / 60));
  return `Builds of this app usually take about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
