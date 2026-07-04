// Applies the checked-in SQL migrations from ./drizzle at container start.
// Robust against the two situations deployment (M6) has to survive:
//   - DATABASE_URL missing -> clear error, exit 1 (the server cannot run without it).
//   - No migrations yet     -> warn and exit 0 so the container still boots. Early on the
//                              schema is applied via `drizzle-kit push`; once migrations are
//                              generated (`drizzle-kit generate`) and committed they land here.
import { existsSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "FATAL: DATABASE_URL is not set — cannot apply migrations. Set it in the environment (.env).",
  );
  process.exit(1);
}

const journal = "./drizzle/meta/_journal.json";
if (!existsSync(journal)) {
  console.warn(
    "WARN: no migrations found in ./drizzle (meta/_journal.json missing) — skipping migrate step. " +
      "Apply the schema another way (drizzle-kit generate + commit, or drizzle-kit push).",
  );
  process.exit(0);
}

// Imported lazily so the skip path above needs nothing but node:fs.
const { drizzle } = await import("drizzle-orm/node-postgres");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const { default: pg } = await import("pg");

const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} finally {
  await pool.end();
}
