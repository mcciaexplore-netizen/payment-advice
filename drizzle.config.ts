import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// `generate` only diffs lib/db/schema.ts against the migrations folder and
// never opens a connection, so a placeholder keeps it usable before
// DATABASE_URL exists. `migrate` / `studio` do connect and will fail with a
// clear connection error if DATABASE_URL is still unset at that point.
export default defineConfig({
  out: "./lib/db/migrations",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder/placeholder",
  },
});
