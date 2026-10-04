"use server";

import { revalidatePath } from "next/cache";
import type { MessageThreadKind, NotificationCategory } from "@prisma/client";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getActor } from "@/lib/auth/cookies";
import {
  broadcastAnnouncement,
  markAllNotificationsRead,
  markNotificationRead,
  resetTemplate,
  updateMyPreferences,
  updateTemplate,
  type PreferenceRow,
} from "@/server/services/notifications";
import { decideReport, postMessage, reportMessage, setThreadLock, type MessageView } from "@/server/services/messaging";

/* ------------------------------------------------------------------ Player: the notification centre */

export async function markReadAction(id: string): Promise<ActionResult<{ updated: number }>> {
  try {
    const res = await markNotificationRead(await getActor(), id);
    revalidatePath("/app/notifications");
    revalidatePath("/app");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markCategoryReadAction(category?: NotificationCategory): Promise<ActionResult<{ updated: number }>> {
  try {
    const res = await markAllNotificationsRead(await getActor(), category);
    revalidatePath("/app/notifications");
    revalidatePath("/app");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updatePreferencesAction(rows: PreferenceRow[]): Promise<ActionResult<PreferenceRow[]>> {
  try {
    const res = await updateMyPreferences(await getActor(), { rows });
    revalidatePath("/app/notifications/preferences");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

/* ------------------------------------------------------------------ Admin: templates and announcements */

export async function updateTemplateAction(type: string, input: Record<string, unknown>): Promise<ActionResult<{ type: string }>> {
  try {
    const row = await updateTemplate(await getActor(), type, input);
    revalidatePath("/admin/notifications");
    return { ok: true, data: { type: row.type } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetTemplateAction(type: string): Promise<ActionResult<{ type: string }>> {
  try {
    const row = await resetTemplate(await getActor(), type);
    revalidatePath("/admin/notifications");
    return { ok: true, data: { type: row.type } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendAnnouncementAction(input: Record<string, unknown>): Promise<ActionResult<{ sent: number; recipients: number }>> {
  try {
    const res = await broadcastAnnouncement(await getActor(), input);
    revalidatePath("/admin/notifications");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

/* ------------------------------------------------------------------ Messaging */

export async function postMessageAction(kind: MessageThreadKind, subjectId: string, body: string, path?: string): Promise<ActionResult<MessageView>> {
  try {
    const message = await postMessage(await getActor(), kind, subjectId, { body });
    if (path) revalidatePath(path);
    revalidatePath("/app/messages");
    return { ok: true, data: message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reportMessageAction(messageId: string, input: Record<string, unknown>, path?: string): Promise<ActionResult<{ reportId: string }>> {
  try {
    const res = await reportMessage(await getActor(), messageId, input);
    if (path) revalidatePath(path);
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideReportAction(reportId: string, input: Record<string, unknown>): Promise<ActionResult<{ ok: true; removed: boolean }>> {
  try {
    const res = await decideReport(await getActor(), reportId, input);
    revalidatePath("/admin/moderation");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setThreadLockAction(threadId: string, locked: boolean): Promise<ActionResult<{ ok: true }>> {
  try {
    const res = await setThreadLock(await getActor(), threadId, locked);
    revalidatePath("/admin/moderation");
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}
