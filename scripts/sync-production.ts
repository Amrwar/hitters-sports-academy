/**
 * Idempotent production sync, run on every deploy after migrations:
 * - keeps RolePermission in sync with the code matrix (without it nobody has permissions)
 * - writes any notification template the catalogue has gained, never touching wording an admin edited
 * - creates the first SUPER_ADMIN from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD when
 *   no super admin exists yet (the password variable can be removed afterwards)
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { seedRolePermissions } from "../src/server/services/permissions-seed";
import { seedNotificationTemplates } from "../src/server/services/notifications";

const db = new PrismaClient();

async function main() {
  const perms = await seedRolePermissions(db);
  console.log(`[sync] permissions: ${perms.total} grants (${perms.removed} stale removed)`);

  const templates = await seedNotificationTemplates(db);
  console.log(`[sync] notification templates: ${templates.total} types (${templates.created} added)`);

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const existing = await db.user.count({ where: { globalRole: "SUPER_ADMIN" } });
  if (existing > 0) {
    console.log(`[sync] super admin present (${existing}); bootstrap skipped`);
    return;
  }
  if (!email || !password) {
    console.warn("[sync] no SUPER_ADMIN exists and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not set; admin area will be inaccessible until one is created");
    return;
  }
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters");
  const passwordHash = await hashPassword(password);
  await db.user.upsert({
    where: { email },
    create: { email, name: "HITTERS Admin", passwordHash, globalRole: "SUPER_ADMIN", emailVerifiedAt: new Date(), playerProfile: { create: {} } },
    update: { globalRole: "SUPER_ADMIN", passwordHash, emailVerifiedAt: new Date() },
  });
  console.log(`[sync] bootstrap super admin ready: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
