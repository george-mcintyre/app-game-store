import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  server: {
    // Local worker during development; production serves both from one host.
    proxy: { "/api": "http://localhost:8787", "/dl": "http://localhost:8787" },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
