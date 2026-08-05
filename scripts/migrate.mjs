// Applies the checked-in SQL migrations from ./drizzle at container start.
// Fails closed on the two situations deployment (M6) has to survive:
//   - DATABASE_URL missing  -> clear error, exit 1 (the server cannot run without it).
//   - Migrations journal gone -> exit 1. The runtime image bakes in ./drizzle; a missing
//                                journal means a broken image (COPY dropped drizzle/) or a
//                                lost mount — booting anyway would leave every page 500ing
//                                against an empty schema. Never skip silently.
import { existsSync, readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "FATAL: DATABASE_URL is not set — cannot apply migrations. Set it in the environment (.env).",
  );
  process.exit(1);
}

const journalPath = "./drizzle/meta/_journal.json";
if (!existsSync(journalPath)) {
  console.error(
    `FATAL: migrations journal missing (${journalPath}). The image must ship ./drizzle — ` +
      "this points at a broken build (COPY dropped drizzle/) or a missing mount. Aborting.",
  );
  process.exit(1);
}

// Cross-check that every journal entry has its .sql file — a partial COPY would
// otherwise let migrate() run an incomplete set and leave the schema half-applied.
const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const missingSql = (journal.entries ?? [])
  .map((e) => `./drizzle/${e.tag}.sql`)
  .filter((f) => !existsSync(f));
if (missingSql.length > 0) {
  console.error(
    `FATAL: journal references migration files that are missing: ${missingSql.join(", ")}. Aborting.`,
  );
  process.exit(1);
}

const { drizzle } = await import("drizzle-orm/node-postgres");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { default: pg } = await import("pg");

// connectionTimeoutMillis: fail fast (10s) if the DB is unreachable instead of
// hanging the container in `starting` forever.
const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 10_000 });

// Advisory-lock key: an arbitrary but fixed constant so concurrent container starts
// serialize on migrate() instead of racing (duplicate DDL -> crash loop). Stays within
// JS safe-integer range; Postgres casts the text param to bigint for pg_advisory_lock.
const MIGRATION_LOCK_KEY = 4711002306;

const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
  }
} finally {
  client.release();
  await pool.end();
}
