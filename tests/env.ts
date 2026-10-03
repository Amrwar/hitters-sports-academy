import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader (no dependency) and test database switch. */
export function loadTestEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  }
  const test = process.env.TEST_DATABASE_URL;
  if (!test) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
  if (!/test/i.test(test)) throw new Error("Refusing to run tests: TEST_DATABASE_URL must point at a database whose name contains 'test'.");
  process.env.DATABASE_URL = test;
  (process.env as Record<string, string>).NODE_ENV = "test";
}
