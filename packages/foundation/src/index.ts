/**
 * @ai/foundation — the shared foundation package (Module 0).
 *
 * Exports grow stage by stage:
 *   Stage 1 (now):  hosts (subdomain resolution, ecosystem links)
 *   Stage 2:        Clerk auth wiring + session→role exposure
 *   Stage 4:        Stripe rails (customers, vaulting, PAD, charges, webhooks)
 *   Stage 5:        brand theming (brands table + render-time resolution)
 *   Stage 6:        notify() (Resend / Twilio / web-push)
 *   Stage 7:        storage helpers (buckets, uploads, signed URLs)
 *   Stage 8:        UI kit + money/tax/dates/audit utilities
 *
 * Everything exported from the package root must be edge-safe (importable
 * from middleware). Node-only modules will export from subpaths.
 */

export * from './hosts';
export * from './access';
export * from './brands';
export * from './family-policy';
export * from './pricing';
export * from './csv';
export * from './facility-tree';
export * from './availability';
export * from './recurrence';
export * from './rentals-core';
export * from './programs-core';
export * from './programs-refunds';
export * from './gear';
export * from './staff-core';
export * from './staff-pay';
export * from './billing-events';
export * from './notify-templates';
export * from './money';
export * from './tax';
export * from './dates';
export * from './audit';
// Server-only rails, imported from subpaths (keep this root edge-safe):
//   '@ai/foundation/stripe'  — Stripe client rails
//   '@ai/foundation/notify'  — notify() send layer (Resend/Twilio/web-push)
