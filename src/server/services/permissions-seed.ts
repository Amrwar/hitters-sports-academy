import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { invalidatePermissionCache } from "@/lib/auth/authorize";

/** Syncs RolePermission with the code matrix: adds missing grants, removes grants no longer in the matrix. */
export async function seedRolePermissions(client: PrismaClient | Prisma.TransactionClient) {
  const wanted = new Set<string>();
  const data: { role: Role; permission: string }[] = [];
  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [Role, readonly string[]][]) {
    for (const permission of perms) {
      wanted.add(`${role}:${permission}`);
      data.push({ role, permission });
    }
  }
  const existing = await client.rolePermission.findMany();
  const stale = existing.filter((r) => !wanted.has(`${r.role}:${r.permission}`)).map((r) => r.id);
  if (stale.length) await client.rolePermission.deleteMany({ where: { id: { in: stale } } });
  await client.rolePermission.createMany({ data, skipDuplicates: true });
  invalidatePermissionCache();
  return { total: data.length, removed: stale.length };
}
