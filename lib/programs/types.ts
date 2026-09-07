/**
 * Program-type adapter registry — the ONE place a program type's behaviour is
 * declared. Keyed by `program_types.key` (staff can add types in the UI; an
 * unknown key falls back to `GENERIC`).
 *
 * Today checkout, refunds, pricing, the catalog and the admin/public routes
 * each need to know "what kind of program is this" — this registry answers
 * so the answer isn't a string comparison scattered across modules. Adding a
 * program type (say "skills sessions") means: a new entry here, a lib/<type>
 * module that calls `createRegistration()`, and pages — nothing else changes.
 *
 * Pure data (no server imports) so client components can read hrefs.
 */

import { POINTS_EXCLUDED_PROGRAM_TYPES, SCHOLARSHIP_PROGRAM_TYPES } from '@ai/foundation';

export type CapacityScope = 'program' | 'camp_week' | 'dropin_session' | 'team' | 'none';

export interface ProgramTypeAdapter {
  key: string;
  label: string;
  /** Where the seat count is enforced. */
  capacityScope: CapacityScope;
  /** The Module 4 refund/proration engine applies (Club/Academy: case-by-case tuition handling). */
  usesRefundEngine: boolean;
  /** Spend on this type earns Play Points (1 pt / $1). */
  earnsPoints: boolean;
  /** Scholarships (M1 pricing) may be applied. */
  scholarshipEligible: boolean;
  /** The unit refunds prorate by (drives the refund-quote UI copy). */
  refundUnit: 'session' | 'day' | 'none';
  /** Registrations are created by an offer pipeline, never from the public cart. */
  offerBased: boolean;
  /** Public front door for a program of this type. */
  publicHref: (program: { id: number; share_token?: string | null }) => string;
  /** Staff detail screen for a program of this type. */
  adminHref: (program: { id: number }) => string;
}

const catalogHref = (p: { id: number; share_token?: string | null }) => (p.share_token ? `/p/${p.share_token}` : `/programs`);

export const GENERIC: ProgramTypeAdapter = {
  key: 'other',
  label: 'Program',
  capacityScope: 'program',
  usesRefundEngine: true,
  earnsPoints: true,
  scholarshipEligible: false,
  refundUnit: 'session',
  offerBased: false,
  publicHref: catalogHref,
  adminHref: (p) => `/programs/${p.id}`,
};

export const PROGRAM_TYPES: Record<string, ProgramTypeAdapter> = {
  camp: { ...GENERIC, key: 'camp', label: 'Camp', capacityScope: 'camp_week', refundUnit: 'day', adminHref: (p) => `/camps/${p.id}` },
  league: { ...GENERIC, key: 'league', label: 'League', capacityScope: 'team' },
  clinic: { ...GENERIC, key: 'clinic', label: 'Clinic' },
  pickup: { ...GENERIC, key: 'pickup', label: 'Pickup / Drop-In', capacityScope: 'dropin_session', publicHref: (p) => `/programs/general/${p.id}`, adminHref: (p) => `/programs/general/${p.id}` },
  club: { ...GENERIC, key: 'club', label: 'Club', usesRefundEngine: false, earnsPoints: false, scholarshipEligible: true, refundUnit: 'none', offerBased: true, publicHref: () => '/programs', adminHref: (p) => `/club/${p.id}` },
  academy: { ...GENERIC, key: 'academy', label: 'Academy', usesRefundEngine: false, earnsPoints: false, scholarshipEligible: true, refundUnit: 'none', offerBased: true, publicHref: () => '/programs', adminHref: (p) => `/academy/${p.id}` },
  other: GENERIC,
};

/** Adapter for a type key; unknown keys behave like a generic program. */
export function programType(key: string | null | undefined): ProgramTypeAdapter {
  return (key && PROGRAM_TYPES[key]) || GENERIC;
}

// Consistency guards: the pricing function's seeded exclusions must agree with
// the registry (both are edited by hand; a mismatch would silently mis-price).
for (const key of POINTS_EXCLUDED_PROGRAM_TYPES) {
  if (programType(key).earnsPoints) throw new Error(`programType(${key}) must not earn points (pricing.ts disagrees)`);
}
for (const key of SCHOLARSHIP_PROGRAM_TYPES) {
  if (!programType(key).scholarshipEligible) throw new Error(`programType(${key}) must be scholarship-eligible (pricing.ts disagrees)`);
}
