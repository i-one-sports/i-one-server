# Backend Test Strategy

## Unit Tests

Run fast service-level tests with:

```bash
npm test -- --runInBand
```

These tests mock repositories and external providers. They should cover business
rules before e2e tests cover cross-module behavior.

Current high-value unit coverage includes:

- users: registration, auth validation, password flows, email verification, account deletion blockers
- sessions: verification gates, pricing, operating hours, joining, full-session payment initialization
- matches: matchup rules, payment gates, score updates, scorer events
- billing: wallet balance safety, idempotency, checkout, payment completion
- match events: Redis publishing and connection tracking

## E2E Tests

E2E tests use real MongoDB and Redis through Docker, while external providers
such as Paystack, AWS S3, and mail are mocked in the Nest testing module.

Start infrastructure:

```bash
npm run test:e2e:infra:up
```

Run e2e tests:

```bash
npm run test:e2e
```

Tear infrastructure down:

```bash
npm run test:e2e:infra:down
```

The test environment defaults are in `test/setup-env.ts`; copy
`.env.test.example` if you prefer to run with explicit shell env values.

## E2E Coverage Plan

1. Auth smoke: register, login, authenticated profile.
2. Core paid session flow: owner location, verified session start, session config, member join, checkout, sets, matchup, score update.
3. Negative access tests: unauthenticated routes, owner-only routes, non-captain/session constraints.
4. Webhook tests: Paystack signature validation, idempotent duplicate events, amount mismatch.
5. Reporting tests: owner wallet, location billing history, session payment status.
