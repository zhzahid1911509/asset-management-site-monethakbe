import "./load-env";
import { Pool } from "pg";
import { senderDomain } from "../src/server/email-delivery";
const names = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_ENCRYPTION_KEY",
];
console.log("Required settings (secret values are never printed):");
for (const name of names)
  console.log(`${name}: ${process.env[name] ? "set" : "MISSING"}`);
console.log(
  "Effective EMAIL_FROM domain:",
  senderDomain(process.env.EMAIL_FROM) ?? "INVALID / MISSING",
);
console.log(
  "Environment precedence: exported shell variables, then Next.js environment files (.env.local can override .env). Restart both processes after changes.",
);
if (!process.env.DATABASE_URL) process.exit(1);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
});
try {
  const counts = await pool.query(
    "SELECT status,count(*)::int AS count FROM email_jobs GROUP BY status ORDER BY status",
  );
  console.table(counts.rows);
  const recent = await pool.query(
    "SELECT id,status,attempts,last_error,created_at,available_at FROM email_jobs ORDER BY created_at DESC LIMIT 10",
  );
  console.table(recent.rows);
  console.log(
    "pending + attempts 0: likely waiting for a worker. failed: check last_error. sent: accepted by Resend, not confirmation of inbox delivery.",
  );
} catch {
  console.error(
    "Unable to inspect email_jobs. Check database connection and migrations.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
