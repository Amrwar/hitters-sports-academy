"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as locations from "@/server/services/locations";
import * as courts from "@/server/services/courts";
import * as pricing from "@/server/services/pricing";
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

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

/* ------------------------------------------------------------------ Locations */

export async function createLocationAction(form: FormData): Promise<ActionResult<locations.LocationView>> {
  return run(async () => locations.createLocation(await getActor(), obj(form)), ["/admin/locations"]);
}

/** Accepts a plain object so arrays (facilities, openingHours) survive the round trip. */
export async function updateLocationAction(locationId: string, input: Record<string, unknown>): Promise<ActionResult<locations.LocationView>> {
  return run(async () => locations.updateLocation(await getActor(), locationId, input), ["/admin/locations", `/admin/locations/${locationId}`, "/app/locations"]);
}

export async function addLocationPhotoAction(locationId: string, input: { url: string; alt?: string }) {
  return run(async () => locations.addLocationPhoto(await getActor(), locationId, input), [`/admin/locations/${locationId}`, "/app/locations"]);
}

export async function removeLocationPhotoAction(locationId: string, photoId: string) {
  return run(async () => locations.removeLocationPhoto(await getActor(), photoId), [`/admin/locations/${locationId}`, "/app/locations"]);
}

export async function reorderLocationPhotosAction(locationId: string, orderedIds: string[]) {
  return run(async () => locations.reorderLocationPhotos(await getActor(), locationId, orderedIds), [`/admin/locations/${locationId}`, "/app/locations"]);
}

export async function upsertBookingPolicyAction(locationId: string, input: Record<string, unknown>) {
  return run(async () => locations.upsertBookingPolicy(await getActor(), locationId, input), [`/admin/locations/${locationId}`]);
}

/* ------------------------------------------------------------------ Courts */

export async function createCourtAction(form: FormData): Promise<ActionResult<courts.CourtView>> {
  return run(async () => courts.createCourt(await getActor(), obj(form)), ["/admin/courts"]);
}

export async function updateCourtAction(courtId: string, input: Record<string, unknown>): Promise<ActionResult<courts.CourtView>> {
  return run(async () => courts.updateCourt(await getActor(), courtId, input), ["/admin/courts", `/admin/courts/${courtId}`, "/admin/calendar"]);
}

export async function setCourtStatusAction(courtId: string, status: "ACTIVE" | "MAINTENANCE" | "INACTIVE"): Promise<ActionResult<courts.CourtView>> {
  return run(async () => courts.updateCourt(await getActor(), courtId, { status }), ["/admin/courts", `/admin/courts/${courtId}`, "/admin/calendar"]);
}

export async function setCourtAvailabilityAction(courtId: string, rows: unknown[]): Promise<ActionResult<courts.CourtView>> {
  return run(async () => courts.setCourtAvailability(await getActor(), courtId, rows), [`/admin/courts/${courtId}`, "/admin/courts", "/admin/calendar"]);
}

export async function addCourtClosureAction(courtId: string, input: { startLocal: string; endLocal: string; reason?: string }) {
  return run(async () => courts.addCourtClosure(await getActor(), courtId, input), [`/admin/courts/${courtId}`, "/admin/calendar"]);
}

export async function removeCourtClosureAction(courtId: string, closureId: string) {
  return run(async () => courts.removeCourtClosure(await getActor(), closureId), [`/admin/courts/${courtId}`, "/admin/calendar"]);
}

export async function closeLocationCourtsAction(locationId: string, input: { startLocal: string; endLocal: string; reason?: string }) {
  return run(async () => courts.closeLocationCourts(await getActor(), locationId, input), ["/admin/calendar", "/admin/courts"]);
}

/* ------------------------------------------------------------------ Pricing */

export async function createPricingRuleAction(locationId: string, input: Record<string, unknown>) {
  return run(async () => pricing.createPricingRule(await getActor(), locationId, input), [`/admin/locations/${locationId}`, "/admin/calendar"]);
}

export async function updatePricingRuleAction(locationId: string, ruleId: string, input: Record<string, unknown>) {
  return run(async () => pricing.updatePricingRule(await getActor(), ruleId, input), [`/admin/locations/${locationId}`, "/admin/calendar"]);
}

export async function deletePricingRuleAction(locationId: string, ruleId: string) {
  return run(async () => pricing.deletePricingRule(await getActor(), ruleId), [`/admin/locations/${locationId}`, "/admin/calendar"]);
}

/* ------------------------------------------------------------------ People */

export async function grantStaffRoleAction(form: FormData): Promise<ActionResult<MembershipView>> {
  return run(async () => grantStaffRole(await getActor(), obj(form)), ["/admin/staff", "/admin/members"]);
}

export async function revokeStaffRoleAction(membershipId: string): Promise<ActionResult<{ ok: true }>> {
  return run(async () => revokeStaffRole(await getActor(), membershipId), ["/admin/staff", "/admin/members"]);
}

export async function setGlobalRoleAction(userId: string, role: "SUPER_ADMIN" | "ACADEMY_OWNER" | null): Promise<ActionResult<{ userId: string }>> {
  return run(async () => setGlobalRole(await getActor(), userId, role), ["/admin/members"]);
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionResult<{ userId: string }>> {
  return run(async () => setUserStatus(await getActor(), userId, status), ["/admin/members"]);
}

export async function createAssessmentAction(form: FormData): Promise<ActionResult<AssessmentView>> {
  return run(async () => createAssessment(await getActor(), obj(form)), ["/admin/members"]);
}
