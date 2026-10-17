import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { seedCatalog } from "../src/db/seed";
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("Set DATABASE_MIGRATION_URL.");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  await seedCatalog(drizzle(pool));
  console.log("Version 1 catalog seeded; no personal/demo records created.");
} finally {
  await pool.end();
}
