import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

type TestEnv = { DB: D1Database; TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };

await applyD1Migrations((env as unknown as TestEnv).DB, (env as unknown as TestEnv).TEST_MIGRATIONS);
