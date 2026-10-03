import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/cookies";

/** Signed-in users skip the auth screens. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (actor && actor.status === "ACTIVE") redirect("/app");
  return <>{children}</>;
}
