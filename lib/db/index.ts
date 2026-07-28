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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
export type Database = typeof db;
