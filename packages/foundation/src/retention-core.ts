/**
 * Predictive-retention rule engine (Module 16). RULE-BASED AND TRANSPARENT -
 * weighted, tunable signals, never a black box. Output is always person +
 * reason(s) + suggested action, never a bare score. Pure so it unit-tests.
 */

export type RiskLevel = 'red' | 'amber' | 'green';

export interface RetentionSignals {
  /** Days past the household's OWN historical re-enroll date with no registration (0/negative = not late). Highest weight. */
  daysPastOwnReenrollDate: number | null;
  /** Latest rating-of-record (1-5), null if none. */
  feedbackRating: number | null;
  /** Started but never finished a re-registration (M4 abandoned capture). */
  abandonedReRegistration: boolean;
  /** Failed installments / PAD issues last season. */
  failedPayments: number;
  /** Email opens in the last 90d vs the prior 90d (M13). */
  emailOpensRecent: number;
  emailOpensPrior: number;
  /** One sibling re-enrolled while this one (who played) did not. */
  siblingGap: boolean;
  /** Cross-app activity events (Play/live/tickets) recent 90d vs prior 90d. */
  crossAppEventsRecent: number;
  crossAppEventsPrior: number;
}

export interface RuleWeights {
  reenrollTiming: number;
  lowFeedback: number;
  abandonedCart: number;
  paymentFriction: number;
  emailDisengaged: number;
  siblingGap: number;
  crossAppTrend: number;
}

/** Default weights - re-enroll timing dominates per spec; all tunable. */
export const DEFAULT_WEIGHTS: RuleWeights = {
  reenrollTiming: 40,
  lowFeedback: 15,
  abandonedCart: 10,
  paymentFriction: 10,
  emailDisengaged: 10,
  siblingGap: 10,
  crossAppTrend: 15,
};

export interface RiskReason { rule: keyof RuleWeights; points: number; reason: string; suggestedAction: string }

export interface RiskAssessment {
  score: number;          // 0-100
  level: RiskLevel;
  reasons: RiskReason[];  // why - transparent, per-rule
}

/**
 * Trend factor for was-high-now-dark weighting: how sharply activity DROPPED
 * (0 = no drop, 1 = fully dark). A consistently low-touch profile (prior ~0)
 * scores near 0 - the spec weights the TREND more than the absolute level.
 */
export function engagementDrop(recent: number, prior: number): number {
  if (prior <= 0) return 0;                    // never engaged -> no trend signal
  const drop = Math.max(0, prior - recent) / prior;
  // Scale by how engaged they WERE (a drop from 20 events is sharper than from 2).
  const priorMagnitude = Math.min(1, prior / 10);
  return drop * priorMagnitude;
}

/** Run the weighted rules. Score clamps to 100; red >= 50, amber >= 25. */
export function assessRisk(s: RetentionSignals, w: RuleWeights = DEFAULT_WEIGHTS): RiskAssessment {
  const reasons: RiskReason[] = [];

  // 1. Re-enroll timing vs OWN history (highest weight; scales up to 2x at 60d late).
  if (s.daysPastOwnReenrollDate != null && s.daysPastOwnReenrollDate > 0) {
    const scale = Math.min(2, 1 + s.daysPastOwnReenrollDate / 60);
    reasons.push({
      rule: 'reenrollTiming',
      points: Math.round(w.reenrollTiming * scale),
      reason: `${s.daysPastOwnReenrollDate} days past their usual re-enroll date with no registration`,
      suggestedAction: 'Send a targeted re-enrollment offer',
    });
  }

  // 2. Low feedback (1-2 hard, 3 soft).
  if (s.feedbackRating != null && s.feedbackRating <= 3) {
    const hard = s.feedbackRating <= 2;
    reasons.push({
      rule: 'lowFeedback',
      points: hard ? w.lowFeedback : Math.round(w.lowFeedback / 2),
      reason: `Rated their last program ${s.feedbackRating}/5`,
      suggestedAction: 'Assign a follow-up call to address their feedback',
    });
  }

  // 3. Abandoned re-registration.
  if (s.abandonedReRegistration) {
    reasons.push({ rule: 'abandonedCart', points: w.abandonedCart, reason: 'Started re-registration but did not finish', suggestedAction: 'Send an abandoned-cart nudge with a direct checkout link' });
  }

  // 4. Payment friction.
  if (s.failedPayments > 0) {
    reasons.push({ rule: 'paymentFriction', points: Math.min(w.paymentFriction * 2, w.paymentFriction * s.failedPayments), reason: `${s.failedPayments} failed installment${s.failedPayments > 1 ? 's' : ''} last season`, suggestedAction: 'Offer a payment-plan adjustment or PAD setup' });
  }

  // 5. Email disengagement (trend).
  const emailDrop = engagementDrop(s.emailOpensRecent, s.emailOpensPrior);
  if (emailDrop >= 0.5) {
    reasons.push({ rule: 'emailDisengaged', points: Math.round(w.emailDisengaged * emailDrop), reason: `Email opens dropped from ${s.emailOpensPrior} to ${s.emailOpensRecent}`, suggestedAction: 'Try a different channel (SMS/call) - email is going unread' });
  }

  // 6. Sibling gap.
  if (s.siblingGap) {
    reasons.push({ rule: 'siblingGap', points: w.siblingGap, reason: 'A sibling re-enrolled but this athlete has not', suggestedAction: 'Offer the multi-member discount on their registration' });
  }

  // 7. Cross-app engagement trend (was-high-now-dark weighted over absolute level).
  const appDrop = engagementDrop(s.crossAppEventsRecent, s.crossAppEventsPrior);
  if (appDrop >= 0.5) {
    reasons.push({ rule: 'crossAppTrend', points: Math.round(w.crossAppTrend * appDrop), reason: `Cross-app activity dropped from ${s.crossAppEventsPrior} to ${s.crossAppEventsRecent} events`, suggestedAction: 'Re-engage with a personal touchpoint before the season fills' });
  }

  const score = Math.min(100, reasons.reduce((a, r) => a + r.points, 0));
  const level: RiskLevel = score >= 50 ? 'red' : score >= 25 ? 'amber' : 'green';
  return { score, level, reasons };
}
