// Pure-logic checks for the Stripe account (organization) registry.
// Run: npm run test:stripe-accounts
import assert from 'node:assert/strict';
import {
  DEFAULT_STRIPE_ACCOUNT,
  STRIPE_ACCOUNTS,
  accountForBrand,
  normalizeStripeAccount,
  pickStripeAccount,
  singleStripeAccount,
  stripeAccountOrNull,
  stripeEnvName,
} from './__compiled__/stripe-accounts.js';

let n = 0;
const check = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

check('registry: three organizations, default first', () => {
  assert.deepEqual(STRIPE_ACCOUNTS.map((a) => a.id), ['ai', 'op', 'opa']);
  assert.equal(DEFAULT_STRIPE_ACCOUNT, 'ai');
});
check('env names: default keeps the original variable, others add a suffix', () => {
  assert.equal(stripeEnvName('STRIPE_SECRET_KEY', 'ai'), 'STRIPE_SECRET_KEY');
  assert.equal(stripeEnvName('STRIPE_SECRET_KEY', null), 'STRIPE_SECRET_KEY');
  assert.equal(stripeEnvName('STRIPE_WEBHOOK_SECRET', 'op'), 'STRIPE_WEBHOOK_SECRET_OP');
  assert.equal(stripeEnvName('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'opa'), 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_OPA');
});
check('brand default: Orangeville Prep programs settle in the OP account', () => {
  assert.equal(accountForBrand('orangeville-prep'), 'op');
  assert.equal(accountForBrand('athlete-institute'), 'ai');
  assert.equal(accountForBrand('bears'), 'ai');
  assert.equal(accountForBrand(null), 'ai');
});
check('normalize / form values', () => {
  assert.equal(normalizeStripeAccount('bogus'), 'ai');
  assert.equal(stripeAccountOrNull(''), null);
  assert.equal(stripeAccountOrNull('op'), 'op');
  assert.equal(pickStripeAccount(null, 'junk', 'opa'), 'opa');
});
check('singleStripeAccount: agreeing rows resolve, mixed rows throw', () => {
  assert.equal(singleStripeAccount([null, 'ai', undefined]), 'ai');
  assert.equal(singleStripeAccount(['op', 'op']), 'op');
  assert.throws(() => singleStripeAccount(['op', 'ai'], 'programs'), /different organizations/);
});
console.log(`\n${n} checks passed.`);
