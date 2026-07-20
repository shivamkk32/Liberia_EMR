// Role & permission helpers — keep authorization checks consistent across the UI.
// NOTE: the UI hides/shows; the backend ENFORCES. These mirror server-side rules.
import type { Role, User } from "../types";

/** Permission check — the primary UI gate (mirrors server require_permission). */
export function can(user: User | null | undefined, ...codes: string[]): boolean {
  if (!user) return false;
  return codes.some((c) => user.permissions?.includes(c));
}

export const CLINICAL_ROLES: Role[] = ["physician", "nurse", "admin"];

export function isClinical(role: Role | undefined): boolean {
  return !!role && CLINICAL_ROLES.includes(role);
}
export function isFrontDesk(role: Role | undefined): boolean {
  return role === "front_desk";
}
export function isAdmin(role: Role | undefined): boolean {
  return role === "admin";
}

/** Front-desk cannot see clinical visit details (SOAP/encounters/problems/meds). */
export function canViewClinical(role: Role | undefined): boolean {
  return isClinical(role);
}
/** Who may register/find patients and book appointments. */
export function canRegister(role: Role | undefined): boolean {
  return isClinical(role) || isFrontDesk(role);
}
/** Front-desk / admin book for other doctors; a clinician defaults to self. */
export function mustPickProvider(role: Role | undefined): boolean {
  return isFrontDesk(role) || isAdmin(role);
}

export function roleTitle(role: Role | undefined): string {
  switch (role) {
    case "physician": return "Physician";
    case "nurse": return "Nurse";
    case "front_desk": return "Front Desk";
    case "lab": return "Laboratory";
    case "pharmacy": return "Pharmacy";
    case "admin": return "Administrator";
    default: return "Staff";
  }
}
