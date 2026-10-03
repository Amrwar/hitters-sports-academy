import { afterAll, beforeEach } from "vitest";
import { loadTestEnv } from "./env";

loadTestEnv();

beforeEach(async () => {
  const { resetDb } = await import("./helpers");
  await resetDb();
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
});
