"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import * as trainers from "@/server/services/trainers";
import * as lessons from "@/server/services/lessons";
import * as programs from "@/server/services/programs";
import * as packages from "@/server/services/packages";

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PLAYER = ["/app", "/app/trainers", "/app/lessons", "/app/programs", "/app/packages", "/app/profile"];
const ADMIN = ["/admin", "/admin/coaching", "/admin/trainers", "/admin/programs", "/admin/packages"];
const ALL = [...PLAYER, ...ADMIN];

/* ------------------------------------------------------------------ Trainers */
export async function getTrainerDayAction(trainerId: string, locationId: string, dateISO: string): Promise<ActionResult<trainers.TrainerDay>> {
  return run(async () => trainers.getTrainerDay(await getActor(), trainerId, locationId, dateISO));
}
export async function createTrainerProfileAction(input: Record<string, unknown>) {
  return run(async () => trainers.createTrainerProfile(await getActor(), input), ALL);
}
export async function updateTrainerProfileAction(trainerId: string, input: Record<string, unknown>) {
  return run(async () => trainers.updateTrainerProfile(await getActor(), trainerId, input), ALL);
}
export async function setTrainerAvailabilityAction(trainerId: string, rows: { locationId: string; dayOfWeek: number; startMinutes: number; endMinutes: number }[]) {
  return run(async () => trainers.setTrainerAvailability(await getActor(), trainerId, { rows }), ALL);
}
export async function addTimeOffAction(trainerId: string, input: { startLocal: string; endLocal: string; reason?: string }) {
  return run(async () => trainers.addTimeOff(await getActor(), trainerId, input), ALL);
}
export async function removeTimeOffAction(trainerId: string, timeOffId: string) {
  return run(async () => trainers.removeTimeOff(await getActor(), trainerId, timeOffId), ALL);
}

/* ------------------------------------------------------------------ Lessons */
export async function bookLessonAction(input: Record<string, unknown>) {
  return run(async () => lessons.bookLesson(await getActor(), input), ALL);
}
export async function cancelLessonAction(lessonId: string, reason?: string) {
  return run(async () => lessons.cancelLesson(await getActor(), lessonId, { reason }), [...ALL, `/app/lessons/${lessonId}`]);
}
export async function rescheduleLessonAction(lessonId: string, input: { dateISO: string; startMinutes: number; durationMinutes: number }) {
  return run(async () => lessons.rescheduleLesson(await getActor(), lessonId, input), [...ALL, `/app/lessons/${lessonId}`]);
}
export async function respondToLessonRequestAction(lessonId: string, response: "ACCEPT" | "DECLINE") {
  return run(async () => lessons.respondToLessonRequest(await getActor(), lessonId, response), ALL);
}
export async function markLessonAttendanceAction(lessonId: string, status: "COMPLETED" | "NO_SHOW") {
  return run(async () => lessons.markLessonAttendance(await getActor(), lessonId, { status }), ALL);
}
export async function addProgressNoteAction(input: { playerId: string; lessonId?: string; programId?: string; body: string; visibility: "PRIVATE" | "SHARED" }) {
  return run(async () => lessons.addProgressNote(await getActor(), input), ALL);
}
export async function usablePurchasesAction(playerId: string, trainerId: string, locationId: string) {
  return run(async () => packages.usablePurchases(await getActor(), playerId, trainerId, locationId));
}

/* ------------------------------------------------------------------ Programs */
export async function createProgramAction(input: Record<string, unknown>) {
  return run(async () => programs.createProgram(await getActor(), input), ALL);
}
export async function updateProgramAction(programId: string, input: Record<string, unknown>) {
  return run(async () => programs.updateProgram(await getActor(), programId, input), ALL);
}
export async function setProgramStatusAction(programId: string, status: "OPEN" | "CANCELLED" | "DRAFT", reason?: string) {
  return run(async () => programs.setProgramStatus(await getActor(), programId, status, reason), ALL);
}
export async function enrollAction(programId: string, playerId?: string) {
  return run(async () => programs.enroll(await getActor(), programId, { playerId }), [...ALL, `/app/programs/${programId}`]);
}
export async function cancelEnrollmentAction(enrollmentId: string, reason?: string) {
  return run(async () => programs.cancelEnrollment(await getActor(), enrollmentId, { reason }), ALL);
}
export async function markAttendanceAction(sessionId: string, marks: { enrollmentId: string; status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" }[]) {
  return run(async () => programs.markAttendance(await getActor(), sessionId, { marks }), ALL);
}

/* ------------------------------------------------------------------ Packages and payments */
export async function createPackageAction(input: Record<string, unknown>) {
  return run(async () => packages.createPackage(await getActor(), input), ALL);
}
export async function updatePackageAction(packageId: string, input: Record<string, unknown>) {
  return run(async () => packages.updatePackage(await getActor(), packageId, input), ALL);
}
export async function purchasePackageAction(input: Record<string, unknown>) {
  return run(async () => packages.purchasePackage(await getActor(), input), ALL);
}
export async function cancelPurchaseAction(purchaseId: string) {
  return run(async () => packages.cancelPurchase(await getActor(), purchaseId), ALL);
}
export async function recordAcademyPaymentAction(target: packages.PaymentTarget, input: { method: "CASH" | "CARD" | "WALLET"; status?: "PAID" | "WAIVED" }) {
  return run(async () => packages.recordAcademyPayment(await getActor(), target, input), ALL);
}
