import 'dotenv/config';

// e2e tests must never depend on a live external service regardless of
// what a developer's local .env has configured for manual live testing —
// PAYMENT_PROVIDER=paystack there is a deliberate, real opt-in for
// testing against Paystack's sandbox by hand, and must never leak into
// the automated suite (which would make it flaky, slow, hit a real API
// with fixtures never designed for it, and burn real API quota).
process.env.PAYMENT_PROVIDER = 'mock';
