/**
 * Program framework core (Module 4) - PURE, edge-safe. The program-type
 * defaults, participant-standing derivation, age eligibility, and retention
 * math every program type inherits. Refund/proration formulas live in
 * programs-refunds.ts (Stage 7).
 */

import { ageOn } from './family-policy';

export type ProgramCategory = 'Academy' | 'Club' | 'Camps' | 'Youth Sports' | 'Adult';
export const PROGRAM_CATEGORIES: ProgramCategory[] = ['Academy', 'Club', 'Camps', 'Youth Sports', 'Adult'];

/** Proration method a program type defaults to (Stage 7 encodes the formulas). */
export const PRORATION_METHODS = ['league', 'clinic', 'camp', 'dropin', 'none'] as const;
export type ProrationMethod = (typeof PRORATION_METHODS)[number];

export const PROGRAM_STATUSES = ['draft', 'published', 'registration_open', 'full', 'closed', 'archived'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** Statuses in which a family may register (the catalog, cart, drop-in and type modules all gate on this). */
export const REGISTRABLE_STATUSES: readonly ProgramStatus[] = ['published', 'registration_open', 'full'];
export function isRegistrable(status: string): boolean {
  return (REGISTRABLE_STATUSES as readonly string[]).includes(status);
}

export const REGISTRATION_STATUSES = ['active', 'waitlisted', 'withdrawn', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
/** A registration that still holds (or is queued for) a seat. */
export const LIVE_REGISTRATION_STATUSES: readonly RegistrationStatus[] = ['active', 'waitlisted'];

export function isProgramStatus(v: unknown): v is ProgramStatus {
  return typeof v === 'string' && (PROGRAM_STATUSES as readonly string[]).includes(v);
}
export function isProrationMethod(v: unknown): v is ProrationMethod {
  return typeof v === 'string' && (PRORATION_METHODS as readonly string[]).includes(v);
}

/**
 * Participant standing - AUTO-DERIVED from registration history (never set by
 * hand, which is what makes it trustworthy for retention reporting).
 */
export type ParticipantStanding = 'returning_athlete' | 'returning_member' | 'brand_new';

/**
 * @param history  the participant's prior registrations (program_id each)
 * @param programId the program being registered for now
 */
export function deriveStanding(
  history: Array<{ program_id: number }>,
  programId: number,
): ParticipantStanding {
  if (history.length === 0) return 'brand_new';
  return history.some((h) => h.program_id === programId) ? 'returning_athlete' : 'returning_member';
}

/** Seed program types: key, label, default category + proration. Staff can add/edit. */
export interface ProgramTypeSeed {
  key: string;
  name: string;
  defaultCategory: ProgramCategory;
  defaultProration: ProrationMethod;
}

export const PROGRAM_TYPE_SEEDS: ProgramTypeSeed[] = [
  { key: 'camp', name: 'Camp', defaultCategory: 'Camps', defaultProration: 'camp' },
  { key: 'league', name: 'League', defaultCategory: 'Youth Sports', defaultProration: 'league' },
  { key: 'clinic', name: 'Clinic', defaultCategory: 'Youth Sports', defaultProration: 'clinic' },
  { key: 'pickup', name: 'Pickup/Drop-In', defaultCategory: 'Youth Sports', defaultProration: 'dropin' },
  { key: 'club', name: 'Club', defaultCategory: 'Club', defaultProration: 'none' },
  { key: 'academy', name: 'Academy', defaultCategory: 'Academy', defaultProration: 'none' },
  { key: 'other', name: 'Other/Misc', defaultCategory: 'Adult', defaultProration: 'none' },
];

/** Age (whole years) at a date from DOB. */
export function ageAt(dobISO: string, onISO: string): number {
  return ageOn(dobISO, onISO);
}

/** Min/max age gate (inclusive), evaluated by DOB at a reference date. */
export function ageEligible(
  dobISO: string | null | undefined,
  minAge: number | null | undefined,
  maxAge: number | null | undefined,
  onISO: string,
): boolean {
  if (!dobISO) return minAge == null && maxAge == null; // no DOB only passes an unrestricted program
  const age = ageOn(dobISO, onISO);
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

/** Spots left given capacity, active registrations, and live holds. null = unlimited. */
export function spotsRemaining(
  capacity: number | null | undefined,
  activeRegistrations: number,
  activeHolds: number,
): number | null {
  if (capacity == null) return null;
  return Math.max(0, capacity - activeRegistrations - activeHolds);
}

export const HOLD_MINUTES = 10;

/**
 * Retention rate: of LAST season's participants in a program, the % who
 * returned THIS season. Returns 0 when there were none last season.
 */
export function retentionRate(lastSeasonMemberIds: number[], thisSeasonMemberIds: number[]): number {
  const last = new Set(lastSeasonMemberIds);
  if (last.size === 0) return 0;
  const now = new Set(thisSeasonMemberIds);
  let returned = 0;
  for (const id of last) if (now.has(id)) returned++;
  return Math.round((returned / last.size) * 1000) / 10; // one decimal place
}
