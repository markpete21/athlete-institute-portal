-- 0066: Stripe ACCOUNTS (organizations) — which Stripe account money settles in
--
-- Athlete Institute and Orangeville Prep charge through different Stripe
-- accounts under one login (OP Assist may get a third). Programs pick an
-- account (null = follow the brand: orangeville-prep → 'op', else 'ai');
-- rentals pick one directly (null = default). Program orders stamp the
-- account they were charged on so later installments, refunds and the
-- customer-portal flow keep using the same account. Values: 'ai' | 'op' | 'opa'.
-- Keys: STRIPE_SECRET_KEY[_OP|_OPA], STRIPE_WEBHOOK_SECRET[_OP|_OPA],
-- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY[_OP|_OPA]. See packages/foundation/src/stripe-accounts.ts.

alter table public.programs       add column if not exists stripe_account text;
alter table public.program_orders add column if not exists stripe_account text;
alter table public.rentals        add column if not exists stripe_account text;

comment on column public.programs.stripe_account       is 'Stripe account id (ai|op|opa); null = follow brand_key.';
comment on column public.program_orders.stripe_account is 'Stripe account the order was charged on; null = default (pre-0066).';
comment on column public.rentals.stripe_account        is 'Stripe account the rental''s payments settle in; null = default.';
