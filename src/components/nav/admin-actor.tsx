"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AdminActor = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  isGlobal: boolean;
  isSuperAdmin: boolean;
  locationIds: string[];
  /** Unread in-app notifications for this staff member. */
  unread: number;
  /** Reported messages still waiting for a decision at their clubs. */
  openReports: number;
  /**
   * The admin pages this person may actually open, worked out on the server where the permission matrix
   * lives. The sidebar shows these and nothing else: offering a page someone cannot open is how a coach
   * ends up on an error screen having clicked something the application put in front of them.
   */
  navHrefs: string[];
};

const Ctx = createContext<AdminActor | null>(null);

export function AdminActorProvider({ value, children }: { value: AdminActor; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminActor(): AdminActor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminActor must be used inside the admin layout");
  return v;
}
