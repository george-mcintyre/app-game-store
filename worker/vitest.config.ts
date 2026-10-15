import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ADMIN_TOKEN: "test-admin-token",
          BUILD_TOKEN: "test-build-token",
          LINK_SECRET: "test-link-secret",
          GITHUB_TOKEN: "test-github-token",
        },
      },
    }),
  ],
});
