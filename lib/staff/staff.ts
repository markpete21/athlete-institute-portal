import 'server-only';

/**
 * Staff module (Module 5) — barrel. The implementation is split by concern:
 *   records.ts        staff rows, photos, archive, derived status
 *   assignments.ts    assignments, pay schedules, absences, replacement, cost feed
 *   certifications.ts cert types, per-staff certs, role requirements, expiry sweep
 *   availability.ts   staff unavailability
 *   self-view.ts      the coach's own play.* view
 *   insights.ts       ratings, tenure, review log, re-registration
 *   pay-report.ts     pay rows + QuickBooks payout CSV
 * The capability matrix lives in lib/access/capabilities (permission system).
 * Import from the specific module for new code; this barrel keeps existing
 * imports working.
 */
export * from './records';
export * from './assignments';
export * from './certifications';
export * from './availability';
export * from './self-view';
export * from './insights';
export * from './pay-report';
export { capabilitiesForProfile, profileCan, setCapability } from '@/lib/access/capabilities';
