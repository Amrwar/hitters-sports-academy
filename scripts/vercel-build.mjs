/**
 * Vercel build entry (package.json "vercel-build").
 *
 * 1. Generates the Prisma client (never needs a database).
 * 2. If DATABASE_URL is set: applies migrations and syncs production essentials
 *    (permission matrix, optional bootstrap super admin).
 * 3. Builds the Next.js app.
 *
 * Without DATABASE_URL the build still succeeds so preview deployments of static pages work,
 * but every database-backed route will fail at runtime until the variable is configured.
 */
import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};

run("npx prisma generate");

if (process.env.DATABASE_URL) {
  run("npx prisma migrate deploy");
  run("npx tsx scripts/sync-production.ts");
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
