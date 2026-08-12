import { createHmac } from 'node:crypto';
import { verifyPaystackSignature } from './paystack-webhook.util';

// Plain unit tests, not e2e — no DB, no HTTP server. This is a
// deliberate exception to this project's usual "real HTTP + real
// Postgres, never a mock" testing style: signature verification is pure
// cryptography with no external system to exercise for real, and the
// provider's own network call has no live Paystack credentials to test
// against in this environment (see PaystackPaymentProvider's own spec).
describe('verifyPaystackSignature', () => {
  const secretKey = 'sk_test_secret';
  const rawBody = Buffer.from(
    JSON.stringify({ event: 'charge.success', data: { reference: 'abc123' } }),
  );

  function sign(body: Buffer, key: string): string {
    return createHmac('sha512', key).update(body).digest('hex');
  }

  it('accepts a signature computed correctly over the raw body', () => {
    const signature = sign(rawBody, secretKey);
    expect(verifyPaystackSignature(rawBody, signature, secretKey)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const signature = sign(rawBody, 'sk_test_wrong');
    expect(verifyPaystackSignature(rawBody, signature, secretKey)).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const signature = sign(rawBody, secretKey);
    const tampered = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: { reference: 'different' },
      }),
    );
    expect(verifyPaystackSignature(tampered, signature, secretKey)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyPaystackSignature(rawBody, undefined, secretKey)).toBe(false);
  });

  it('rejects a malformed/short signature without throwing', () => {
    expect(
      verifyPaystackSignature(rawBody, 'not-a-real-signature', secretKey),
    ).toBe(false);
  });
});
