import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db";
import { seedCatalog } from "../src/db/seed";
export async function testDatabase() {
  const client = new PGlite();
  const migrations = readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (!migrations.length) throw new Error("No migrations to test");
  for (const f of migrations)
    await client.exec(readFileSync("drizzle/" + f, "utf8"));
  const raw = drizzle(client, { schema });
  const db = raw as unknown as Db;
  await seedCatalog(raw as unknown as Parameters<typeof seedCatalog>[0]);
  return { client, db };
}
