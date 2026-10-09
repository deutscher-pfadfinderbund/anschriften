import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** The handle `db.transaction` passes to its callback. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
