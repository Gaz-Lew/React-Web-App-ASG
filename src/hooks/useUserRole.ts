/**
 * useUserRole.ts — Role-Based Access Control (RBAC) hook
 *
 * Derives role + permission set from the currently logged-in Rep (Zustand store).
 * Works with the existing PIN-based auth system — no Firebase Auth required.
 *
 * Roles (ascending privilege):
 *   rep      — CRM use + own training data
 *   manager  — everything rep can do + view all reps + edit scripts + edit deals
 *   admin    — full access including system settings + rollback + role changes
 *
 * Usage:
 *   const { isAdmin, can } = useUserRole();
 *   if (!can("edit_system_settings")) return <AccessDenied />;
 */

import { useMemo } from "react";
import { useAppStore } from "../stores/appStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "manager" | "rep";

/**
 * Fine-grained actions used throughout the UI.
 * Components call `can(action)` rather than comparing role strings directly.
 */
export type RBACAction =
  // Settings & config
  | "edit_system_settings"    // Admin only
  | "rollback_settings"       // Admin only
  | "change_roles"            // Admin only
  // Admin panel access
  | "view_admin_panel"        // Admin + Manager
  | "view_all_reps"           // Admin + Manager
  | "view_audit_log"          // Admin + Manager
  | "view_system_health"      // Admin + Manager
  | "view_settings_history"   // Admin + Manager
  // Operational writes
  | "edit_scripts"            // Admin + Manager
  | "edit_deals"              // Admin + Manager
  // General access
  | "view_training"           // All roles
  | "use_crm";                // All roles

// ─────────────────────────────────────────────────────────────────────────────
// Permission matrix
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<RBACAction>> = {
  admin: new Set<RBACAction>([
    "edit_system_settings",
    "rollback_settings",
    "change_roles",
    "view_admin_panel",
    "view_all_reps",
    "view_audit_log",
    "view_system_health",
    "view_settings_history",
    "edit_scripts",
    "edit_deals",
    "view_training",
    "use_crm",
  ]),

  manager: new Set<RBACAction>([
    "view_admin_panel",
    "view_all_reps",
    "view_audit_log",
    "view_system_health",
    "edit_scripts",
    "edit_deals",
    "view_training",
    "use_crm",
  ]),

  rep: new Set<RBACAction>([
    "view_training",
    "use_crm",
  ]),
};

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UserRoleReturn {
  role: UserRole;
  isAdmin: boolean;
  isManager: boolean;
  isRep: boolean;
  /** Returns true if the current user has permission for the given action */
  can: (action: RBACAction) => boolean;
  userId: number | null;
  userName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useUserRole(): UserRoleReturn {
  const { currentUser } = useAppStore();

  return useMemo(() => {
    // Cast — Rep.role is "rep" | "manager" | "admin" | undefined
    const raw = currentUser?.role;
    const role: UserRole =
      raw === "admin" ? "admin" :
      raw === "manager" ? "manager" :
      "rep";

    const perms = ROLE_PERMISSIONS[role];

    return {
      role,
      isAdmin:   role === "admin",
      isManager: role === "manager",
      isRep:     role === "rep",
      can: (action: RBACAction) => perms.has(action),
      userId:   currentUser?.id ?? null,
      userName: currentUser?.name ?? "",
    };
  }, [currentUser]);
}

export default useUserRole;
