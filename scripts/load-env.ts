import nextEnv from "@next/env";
// Match Next's .env.local/.env.development/.env.production precedence.
// Exported process variables still take priority, just as in the web process.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
