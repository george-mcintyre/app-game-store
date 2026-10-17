export interface Env {
  DB: D1Database;
  WEBAPP_FILES: KVNamespace;
  ASSETS?: Fetcher;
  PUBLIC_ORIGIN: string;
  APPLE_API_BASE: string;
  GITHUB_API_BASE: string;
  GITHUB_OAUTH_BASE: string;
  GOOGLE_SITE_VERIFICATION?: string;
  LINK_SECRET?: string;
  MASTER_KEY?: string;
  MASTER_KEY_PREVIOUS?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
}

// Outbound calls go through this so tests can replace them.
export interface Deps {
  fetch: typeof fetch;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export const defaultDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
