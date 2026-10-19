import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const env = { ...process.env, NODE_ENV: "development" };
const web = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
const worker = process.env.EMAIL_DELIVERY_MODE === "inngest" ? null : spawn(
  process.execPath,
  ["--import", "tsx", "scripts/email-worker.ts"],
  { stdio: "inherit", env },
);
console.log(
  worker ? "[dev] Starting web app and standalone email worker." : "[dev] Starting web app; email delivery uses Inngest. Start the Inngest dev server for local testing.",
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  web.kill();
  worker?.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
worker?.on("exit", (code) => {
  if (!stopping)
    console.error(
      `[dev] Email worker stopped (${code ?? "signal"}). Verification emails will not be delivered. Fix its reported error and restart npm run dev.`,
    );
});
web.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});
for (const child of [web, worker].filter(Boolean))
  child.on("error", () => {
    console.error(
      "[dev] Unable to start a child process. Run npm ci and retry.",
    );
    stop();
    process.exitCode = 1;
  });
