// How long an app's rebuilds take, measured from the rebuild request to build-ready.
export const DEFAULT_BUILD_SECONDS = 20 * 60;
// Longer builds were queued, blocked or re-run by hand, so they say nothing about the usual time.
export const MAX_SAMPLE_SECONDS = 60 * 60;
// The usual time comes from this many of the latest builds.
export const SAMPLES = 5;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// The usual time plus a tenth, or 20 minutes before the first build.
export function expectedSeconds(typical: number | null): number {
  return typical === null ? DEFAULT_BUILD_SECONDS : Math.round(typical * 1.1);
}
