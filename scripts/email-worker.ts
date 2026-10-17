import "./load-env";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  deliverEmail,
  DeliveryError,
  deliveryHints,
  senderDomain,
} from "../src/server/email-delivery";
const required = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_ENCRYPTION_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (
  missing.length ||
  Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64").length !== 32
) {
  console.error(
    JSON.stringify({
      event: "email.worker.configuration_error",
      missing,
      encryptionKeyValid:
        Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64").length ===
        32,
    }),
  );
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
async function run() {
  await pool.query("SELECT 1 FROM email_jobs LIMIT 1");
  console.log(
    JSON.stringify({
      event: "email.worker.ready",
      senderDomain: senderDomain(process.env.EMAIL_FROM),
    }),
  );
  do {
    // Expire old messages before claiming them, including abandoned old leases.
    await pool.query(
      "UPDATE email_jobs SET status='expired',payload='',lease_token=null,lease_until=null WHERE (status IN ('pending','failed') OR status='processing' AND lease_until<now()) AND created_at<now()-interval '12 hours'",
    );
    await pool.query(
      "UPDATE email_jobs SET status='failed',last_error='LEASE_EXHAUSTED' WHERE status='processing' AND lease_until<now() AND attempts>=5",
    );
    const lease = randomUUID();
    const claimed = await pool.query(
      `UPDATE email_jobs SET status='processing',lease_token=$1,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM email_jobs WHERE (status='pending' AND available_at<=now() OR status='processing' AND lease_until<now()) AND attempts<5 AND created_at>=now()-interval '12 hours' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,payload,attempts`,
      [lease],
    );
    const job = claimed.rows[0];
    if (job) {
      try {
        await deliverEmail(job);
        const updated = await pool.query(
          "UPDATE email_jobs SET status='sent',payload='',last_error=null,lease_token=null,lease_until=null WHERE id=$1 AND lease_token=$2",
          [job.id, lease],
        );
        console.log(
          JSON.stringify({
            event: updated.rowCount
              ? "email.provider_accepted"
              : "email.lease_lost",
            id: job.id,
          }),
        );
      } catch (error) {
        const failure =
          error instanceof DeliveryError
            ? error
            : new DeliveryError("EMAIL_COMPLETION_UNKNOWN", true);
        const next =
          failure.retryable && job.attempts < 5 ? "pending" : "failed";
        const updated = await pool.query(
          "UPDATE email_jobs SET status=$3,last_error=$4,available_at=now()+($5::double precision * interval '1 second'),lease_token=null,lease_until=null WHERE id=$1 AND lease_token=$2",
          [job.id, lease, next, failure.code, failure.delaySeconds],
        );
        console.error(
          JSON.stringify({
            event: updated.rowCount ? "email.failed" : "email.lease_lost",
            id: job.id,
            code: failure.code,
            next,
            hint:
              deliveryHints[failure.code] ??
              "Check email:status and provider configuration; raw email content is not logged.",
          }),
        );
      }
    }
    if (process.argv.includes("--once")) break;
    if (!job) await new Promise((resolve) => setTimeout(resolve, 3000));
  } while (!stopping);
}
try {
  await run();
} catch {
  console.error(
    JSON.stringify({
      event: "email.worker.database_error",
      hint: "Check DATABASE_URL, network/TLS settings, and run db:migrate. Restart the worker after fixing configuration.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
