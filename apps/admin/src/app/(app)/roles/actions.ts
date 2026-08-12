"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { AssignRoleInput, CreateRoleInput, Permission, Role, RoleAssignment } from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export async function createRoleAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const permissionsJson = String(formData.get("permissionsJson") ?? "[]");

  let permissions: Permission[];
  try {
    permissions = JSON.parse(permissionsJson) as Permission[];
  } catch {
    return { error: "Invalid permissions." };
  }

  if (!name || permissions.length === 0) {
    return { error: "A name and at least one permission are required." };
  }

  const input: CreateRoleInput = { name, permissions };

  try {
    await apiFetch<Role>("/roles", { method: "POST", token, body: input });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/roles");
  return { error: null, success: true };
}

export async function assignRoleAction(
  roleId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const chapterId = String(formData.get("chapterId") ?? "").trim();
  const input: AssignRoleInput = {
    memberId: String(formData.get("memberId") ?? ""),
    chapterId: chapterId && chapterId !== "__none__" ? chapterId : undefined,
    termEnd: String(formData.get("termEnd") ?? "").trim() || undefined,
  };

  if (!input.memberId) {
    return { error: "Choose a member." };
  }

  try {
    await apiFetch<RoleAssignment>(`/roles/${roleId}/assignments`, {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath(`/roles/${roleId}`);
  return { error: null, success: true };
}

export async function revokeAssignmentAction(assignmentId: string, roleId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/role-assignments/${assignmentId}/revoke`, { method: "PATCH", token, body: {} });
  revalidatePath(`/roles/${roleId}`);
}
