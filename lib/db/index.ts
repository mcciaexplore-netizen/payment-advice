import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Serial-number allocation (lib/serial.ts) needs a real `SELECT ... FOR
// UPDATE` inside a transaction, which the stateless neon-http driver cannot
// give us. The WebSocket-based Pool driver below supports genuine
// transactions and is still safe to use per-request on Vercel serverless.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let cached: DrizzleDb | undefined;

// The connection is created lazily, on first actual use, rather than at
// module load. `next build` imports every route module to collect its
// metadata without ever calling it — throwing here at import time (as this
// used to) fails the build any time DATABASE_URL isn't visible at that
// exact step, regardless of whether it's configured for the deploy itself.
function getDb(): DrizzleDb {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const pool = new Pool({ connectionString });
  cached = drizzle(pool, { schema });
  return cached;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export type Database = typeof db;
