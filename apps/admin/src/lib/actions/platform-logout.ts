"use server";

import { redirect } from "next/navigation";
import { clearPlatformSessionCookie } from "@/lib/platform-session";

export async function platformLogoutAction() {
  await clearPlatformSessionCookie();
  redirect("/platform/login");
}
