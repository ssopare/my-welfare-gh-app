import { createHmac, timingSafeEqual } from 'node:crypto';

// Paystack signs webhook deliveries with HMAC-SHA512 over the *raw*
// request bytes (not a re-serialization of the parsed JSON — those can
// silently differ, breaking verification). Pulled out as its own pure
// function so it's unit-testable without a running HTTP server; see
// PaymentController.handlePaystackWebhook for the one caller.
export function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secretKey: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  // timingSafeEqual throws on length mismatch rather than returning
  // false, and requires equal-length buffers — check first so an
  // attacker can't glean anything from response timing either way.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
