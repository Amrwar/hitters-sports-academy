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
