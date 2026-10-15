export interface Env {
  STORE: KVNamespace;
  SITE_ORIGIN: string;
  SITE_BASE: string;
  APPLE_API_BASE: string;
  GITHUB_API_BASE: string;
  ADMIN_TOKEN?: string;
  BUILD_TOKEN?: string;
  LINK_SECRET?: string;
  GITHUB_TOKEN?: string;
  APPLE_ISSUER_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_TEAM_ID?: string;
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
