"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import { updateProfile, type ProfileView } from "@/server/services/profiles";
import { markAllNotificationsRead, markNotificationRead } from "@/server/services/notifications";

export async function updateProfileAction(profileId: string, input: FormData | Record<string, unknown>): Promise<ActionResult<ProfileView>> {
  try {
    let data: Record<string, unknown>;
    if (input instanceof FormData) {
      data = {};
      input.forEach((v, k) => {
        if (typeof v === "string") data[k] = v;
      });
      if (data.homeLocationId === "") data.homeLocationId = null;
    } else data = input;
    const profile = await updateProfile(await getActor(), profileId, data);
    revalidatePath("/app/profile");
    revalidatePath("/app");
    return { ok: true, data: profile };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markNotificationReadAction(id: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const res = await markNotificationRead(await getActor(), id);
    revalidatePath("/app/notifications");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ updated: number }>> {
  try {
    const res = await markAllNotificationsRead(await getActor());
    revalidatePath("/app/notifications");
    revalidatePath("/app");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}
