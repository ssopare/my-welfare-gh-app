"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Notification } from "@welfare/shared-types";

export async function markReadAction(notificationId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/notifications/${notificationId}/read`, { method: "PATCH", token, body: {} });
  revalidatePath("/notifications");
}

// No bulk-read endpoint exists on the API — this is a real convenience
// built from the one real primitive that does exist (mark-one-read),
// called once per currently-unread notification, not a fake feature.
export async function markAllReadAction(memberId: string): Promise<void> {
  const { token } = await requireSession();
  const notifications = await apiFetch<Notification[]>(`/members/${memberId}/notifications`, {
    token,
    cache: "no-store",
  });
  const unread = notifications.filter((n) => !n.readAt);
  for (const notification of unread) {
    await apiFetch(`/notifications/${notification.id}/read`, { method: "PATCH", token, body: {} });
  }
  revalidatePath("/notifications");
}
