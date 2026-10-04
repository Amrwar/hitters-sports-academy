/**
 * Vercel build entry (package.json "vercel-build").
 *
 * 1. Generates the Prisma client (never needs a database).
 * 2. If DATABASE_URL is set: applies migrations and syncs production essentials
 *    (permission matrix, notification templates, optional bootstrap super admin).
 * 3. Builds the Next.js app.
 *
 * Serverless Postgres scales to zero, so the first connection of a build often lands while the database is
 * still waking and Prisma gives up with P1002 ("reached but timed out"). That is a cold start, not a broken
 * migration, so the database steps are retried with a short backoff before the build is failed.
 *
 * Without DATABASE_URL the build still succeeds so preview deployments of static pages work,
 * but every database-backed route will fail at runtime until the variable is configured.
 */
import { execSync } from "node:child_process";

const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env, ...opts });
};

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Runs a command that touches the database, retrying with backoff. Output is inherited so the logs read
 * normally, which means the failure reason cannot be inspected here; a genuinely broken migration simply
 * fails every attempt and still fails the build, a few seconds later than it would have.
 */
function runWithRetry(cmd, { attempts = 4, waitMs = 5_000 } = {}) {
  let wait = waitMs;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      run(cmd);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`\n[build] "${cmd}" failed on attempt ${attempt} of ${attempts}. The database may still be waking; retrying in ${wait / 1000}s.`);
      sleep(wait);
      wait *= 2;
    }
  }
}

run("npx prisma generate");

if (process.env.DATABASE_URL) {
  runWithRetry("npx prisma migrate deploy", { attempts: 5, waitMs: 4_000 });
  runWithRetry("npx tsx scripts/sync-production.ts", { attempts: 3, waitMs: 5_000 });
} else {
  console.warn(
    [
      "",
      "================================================================================",
      " DATABASE_URL is not set in this Vercel environment.",
      " Skipping `prisma migrate deploy`. The app will build, but any page that touches",
      " the database will fail at runtime.",
      "",
      " Fix: Vercel project -> Settings -> Environment Variables -> add DATABASE_URL",
      " (a Postgres URL; Neon via Vercel Storage is the quickest), plus APP_URL.",
      " Optional first-run bootstrap: BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD.",
      "================================================================================",
      "",
    ].join("\n"),
  );
}

run("npx next build");
