import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { scheduleReminderEmails } from "../src/server/notifications";
import { processEmailJob, recoverableEmailIds } from "../src/server/email-jobs";
import { senderDomain } from "../src/server/email-delivery";
if (process.env.EMAIL_DELIVERY_MODE === "inngest") {
  console.error("EMAIL_DELIVERY_MODE=inngest: use the synced Inngest app; do not start the standalone worker.");
  process.exit(1);
}
const missing = ["DATABASE_URL", "RESEND_API_KEY", "EMAIL_FROM", "APP_ENCRYPTION_KEY", "APP_ORIGIN"].filter(k => !process.env[k]);
if (missing.length || Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64").length !== 32) {
  console.error(JSON.stringify({event: "email.worker.configuration_error", missing}));
  process.exit(1);
}
const pool = new Pool({connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000, statement_timeout: 15000});
const db = drizzle(pool, {schema});
let stopping = false;
process.on("SIGTERM", () => {stopping = true;});
process.on("SIGINT", () => {stopping = true;});
let cursor: string | undefined;
let nextSchedule = 0;
try {
  await pool.query("SELECT 1 FROM email_jobs LIMIT 1");
  console.log(JSON.stringify({event: "email.worker.ready", senderDomain: senderDomain(process.env.EMAIL_FROM)}));
  do {
    if (Date.now() >= nextSchedule) {
      const result = await scheduleReminderEmails(db, new Date(), cursor);
      cursor = result.nextCursor;
      nextSchedule = Date.now() + 15000;
    }
    const [job] = await recoverableEmailIds(db);
    if (job) await processEmailJob(db, job.id);
    if (process.argv.includes("--once")) break;
    if (!job) await new Promise(resolve => setTimeout(resolve, 3000));
  } while (!stopping);
} catch {
  console.error(JSON.stringify({event: "email.worker.database_error"}));
  process.exitCode = 1;
} finally { await pool.end(); }
