import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
export const createDb = (connectionString: string) =>
  drizzle(
    new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    }),
    { schema },
  );
export type Db = ReturnType<typeof createDb>;
let db: Db | undefined;
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (db ??= createDb(process.env.DATABASE_URL));
}
