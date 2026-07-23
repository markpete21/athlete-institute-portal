/**
 * Family / household policy (Module 1 §Families & HoH) — PURE, edge-safe.
 *
 * Access model:
 *   hoh        owns the account: manage members, payment methods, settings,
 *              register + pay for anyone in the household
 *   secondary  transact-not-alter: register + pay, CANNOT change settings /
 *              members / payment methods
 *   dependent  under 18: view-only of their own schedule/registrations
 *   adult      18+: registers THEMSELVES for adult programs (parents can still
 *              register them too); stays in household until they ask to leave
 */

export type FamilyMemberRole = 'hoh' | 'secondary' | 'dependent' | 'adult';

/** Age in whole years at `on` (defaults handled by callers — no Date.now here). */
export function ageOn(dobIso: string, onIso: string): number {
  const dob = new Date(dobIso);
  const on = new Date(onIso);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdult(dobIso: string, onIso: string): boolean {
  return ageOn(dobIso, onIso) >= 18;
}

/**
 * The 18+ auto-conversion: a dependent who has turned 18 becomes an adult
 * member. All other roles are stable (never auto-downgraded).
 */
export function memberRoleAfterBirthdays(
  current: FamilyMemberRole,
  dobIso: string | null,
  onIso: string,
): FamilyMemberRole {
  if (current === 'dependent' && dobIso && isAdult(dobIso, onIso)) return 'adult';
  return current;
}

/** May this member change household settings / members / payment methods? */
export function canManageFamily(role: FamilyMemberRole): boolean {
  return role === 'hoh';
}

/** May this member register + pay (for the household)? */
export function canTransactForFamily(role: FamilyMemberRole): boolean {
  return role === 'hoh' || role === 'secondary';
}

/** May this member register THEMSELVES (adult self-serve)? */
export function canSelfRegister(role: FamilyMemberRole): boolean {
  return role === 'hoh' || role === 'secondary' || role === 'adult';
}
