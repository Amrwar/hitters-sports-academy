import { execSync } from "node:child_process";
import { loadTestEnv } from "./env";

/** Applies migrations to the test database once per run (never `migrate dev`, so no schema drift is written). */
export default function globalSetup() {
  loadTestEnv();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL } });
}
