import "./load-env";
import { getDb } from "../src/db";
import { cleanupDocuments } from "../src/server/documents";
const db = getDb();
try {
  if (process.argv.slice(2).some((arg) => arg !== "--apply"))
    throw new Error("Use no arguments for dry-run, or --apply.");
  const result = await cleanupDocuments(db, process.argv.includes("--apply"));
  console.log(
    JSON.stringify({
      event: "documents.cleanup",
      apply: process.argv.includes("--apply"),
      ...result,
    }),
  );
} finally {
  await db.$client.end();
}
