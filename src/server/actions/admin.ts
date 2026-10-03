"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import { createLocation, updateLocation, type LocationView } from "@/server/services/locations";
import { createCourt, updateCourt, type CourtView } from "@/server/services/courts";
import { grantStaffRole, revokeStaffRole, type MembershipView } from "@/server/services/staff";
import { setGlobalRole, setUserStatus } from "@/server/services/users";
import { createAssessment, type AssessmentView } from "@/server/services/assessments";

function obj(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

export async function createLocationAction(form: FormData): Promise<ActionResult<LocationView>> {
  try {
    const loc = await createLocation(await getActor(), obj(form));
    revalidatePath("/admin/locations");
    return { ok: true, data: loc };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateLocationAction(locationId: string, form: FormData): Promise<ActionResult<LocationView>> {
  try {
    const loc = await updateLocation(await getActor(), locationId, obj(form));
    revalidatePath("/admin/locations");
    return { ok: true, data: loc };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createCourtAction(form: FormData): Promise<ActionResult<CourtView>> {
  try {
    const court = await createCourt(await getActor(), obj(form));
    revalidatePath("/admin/courts");
    return { ok: true, data: court };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCourtStatusAction(courtId: string, status: "ACTIVE" | "MAINTENANCE" | "INACTIVE"): Promise<ActionResult<CourtView>> {
  try {
    const court = await updateCourt(await getActor(), courtId, { status });
    revalidatePath("/admin/courts");
    return { ok: true, data: court };
  } catch (e) {
    return toActionError(e);
  }
}

export async function grantStaffRoleAction(form: FormData): Promise<ActionResult<MembershipView>> {
  try {
    const m = await grantStaffRole(await getActor(), obj(form));
    revalidatePath("/admin/staff");
    revalidatePath("/admin/members");
    return { ok: true, data: m };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeStaffRoleAction(membershipId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const res = await revokeStaffRole(await getActor(), membershipId);
    revalidatePath("/admin/staff");
    revalidatePath("/admin/members");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setGlobalRoleAction(userId: string, role: "SUPER_ADMIN" | "ACADEMY_OWNER" | null): Promise<ActionResult<{ userId: string }>> {
  try {
    const res = await setGlobalRole(await getActor(), userId, role);
    revalidatePath("/admin/members");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionResult<{ userId: string }>> {
  try {
    const res = await setUserStatus(await getActor(), userId, status);
    revalidatePath("/admin/members");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createAssessmentAction(form: FormData): Promise<ActionResult<AssessmentView>> {
  try {
    const data = obj(form);
    const res = await createAssessment(await getActor(), data);
    revalidatePath("/admin/members");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}
