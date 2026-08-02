/**
 * The three high-level account types (plus tenant from Module 1). Stored
 * values are Module 1's originals - 'customer' DISPLAYS as "Member"
 * everywhere; renaming the stored value would touch 17 call sites for zero
 * behaviour change. Staff is an account type, not a cage: staff accounts
 * register for programs like anyone else.
 *
 * Lives here rather than in actions.ts because a 'use server' module may only
 * export async functions - exporting this const from there compiles fine in
 * dev and fails the production build.
 */
export const ACCOUNT_TYPES = [
  { value: 'customer', label: 'Member' },
  { value: 'organization', label: 'Organization' },
  { value: 'staff', label: 'Staff' },
  { value: 'tenant', label: 'Tenant' },
] as const;
