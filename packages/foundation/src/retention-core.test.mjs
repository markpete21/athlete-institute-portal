/**
 * Retention rule-engine tests (Module 16). Run: npm run test:retention
 */
import { DEFAULT_WEIGHTS, assessRisk, engagementDrop } from './__compiled__/retention-core.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : ` - ${d}`}`); c ? pass++ : fail++; };

const BASE = {
  daysPastOwnReenrollDate: null, feedbackRating: null, abandonedReRegistration: false,
  failedPayments: 0, emailOpensRecent: 5, emailOpensPrior: 5, siblingGap: false,
  crossAppEventsRecent: 10, crossAppEventsPrior: 10,
};

// --- re-enroll timing vs OWN history (highest weight) ------------------------
{
  const green = assessRisk({ ...BASE });
  ok('no signals -> green, no reasons', green.level === 'green' && green.reasons.length === 0 && green.score === 0);

  const late = assessRisk({ ...BASE, daysPastOwnReenrollDate: 30 });
  ok('past own re-enroll date -> flagged with reason + action', late.reasons.length === 1 && late.reasons[0].rule === 'reenrollTiming' && late.reasons[0].suggestedAction.length > 0, JSON.stringify(late.reasons[0]));
  ok('re-enroll timing alone reaches red (highest weight)', late.level === 'red', `${late.score} ${late.level}`);

  const veryLate = assessRisk({ ...BASE, daysPastOwnReenrollDate: 90 });
  ok('later = more points (scales, capped 2x)', veryLate.score > late.score && veryLate.reasons[0].points <= DEFAULT_WEIGHTS.reenrollTiming * 2, `${late.score} -> ${veryLate.score}`);

  const notLate = assessRisk({ ...BASE, daysPastOwnReenrollDate: -5 });
  ok('before their usual date -> no flag', notLate.reasons.length === 0);
}

// --- trend weighting: was-high-now-dark beats consistently-low ---------------
{
  ok('drop factor: engaged->dark is high', engagementDrop(0, 20) === 1, `${engagementDrop(0, 20)}`);
  ok('drop factor: consistently low = 0', engagementDrop(0, 0) === 0);
  ok('drop factor: low-touch family scores lower than was-high family', engagementDrop(0, 2) < engagementDrop(0, 20), `${engagementDrop(0, 2)} vs ${engagementDrop(0, 20)}`);

  const wasHigh = assessRisk({ ...BASE, crossAppEventsRecent: 0, crossAppEventsPrior: 20 });
  const alwaysLow = assessRisk({ ...BASE, crossAppEventsRecent: 0, crossAppEventsPrior: 1 });
  ok('was-high-now-dark flags; consistently-low does not', wasHigh.reasons.some((r) => r.rule === 'crossAppTrend') && alwaysLow.reasons.length === 0, `${wasHigh.score} vs ${alwaysLow.score}`);
}

// --- individual signals attach reasons + actions -----------------------------
{
  const fb = assessRisk({ ...BASE, feedbackRating: 2 });
  ok('low feedback flags w/ call action', fb.reasons[0]?.rule === 'lowFeedback' && /call/i.test(fb.reasons[0].suggestedAction));
  const fb3 = assessRisk({ ...BASE, feedbackRating: 3 });
  ok('3-star = soft flag (half points)', fb3.reasons[0]?.points === Math.round(DEFAULT_WEIGHTS.lowFeedback / 2));

  const ab = assessRisk({ ...BASE, abandonedReRegistration: true });
  ok('abandoned re-registration flags w/ nudge action', ab.reasons[0]?.rule === 'abandonedCart' && /nudge|checkout/i.test(ab.reasons[0].suggestedAction));

  const pay = assessRisk({ ...BASE, failedPayments: 2 });
  ok('payment friction scales w/ failures (capped 2x)', pay.reasons[0]?.points === DEFAULT_WEIGHTS.paymentFriction * 2);

  const sib = assessRisk({ ...BASE, siblingGap: true });
  ok('sibling gap flags w/ multi-member discount action', sib.reasons[0]?.rule === 'siblingGap' && /discount/i.test(sib.reasons[0].suggestedAction));

  const email = assessRisk({ ...BASE, emailOpensRecent: 0, emailOpensPrior: 10 });
  ok('email disengagement flags w/ channel-switch action', email.reasons[0]?.rule === 'emailDisengaged' && /channel|SMS|call/i.test(email.reasons[0].suggestedAction));
}

// --- stacking + levels + tunable weights -------------------------------------
{
  const stacked = assessRisk({ ...BASE, daysPastOwnReenrollDate: 20, feedbackRating: 2, abandonedReRegistration: true, failedPayments: 1, siblingGap: true, crossAppEventsRecent: 0, crossAppEventsPrior: 20 });
  ok('stacked signals -> red, all reasons attached', stacked.level === 'red' && stacked.reasons.length === 6 && stacked.score === 100, `${stacked.score}, ${stacked.reasons.length} reasons`);

  const amber = assessRisk({ ...BASE, feedbackRating: 2, siblingGap: true });
  ok('mid signals -> amber', amber.level === 'amber', `${amber.score} ${amber.level}`);

  // Tunable: zero out re-enroll timing and it no longer flags red alone.
  const tuned = assessRisk({ ...BASE, daysPastOwnReenrollDate: 30 }, { ...DEFAULT_WEIGHTS, reenrollTiming: 10 });
  ok('weights are tunable', tuned.level !== 'red' && tuned.score < 25, `${tuned.score}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
