import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PaystackPaymentProvider } from './paystack-payment-provider.service';
import type { InitiatePaymentParams } from './payment-provider.interface';

// Plain unit test, not e2e — mocks the network boundary (global fetch)
// rather than hitting Paystack for real, since no live credentials exist
// for this project. Asserts the request this app builds and how it maps
// Paystack's response back, not Paystack's own behavior. The
// constructor reads PAYSTACK_SECRET_KEY fresh on every `new`, so setting
// it in beforeEach is enough — no module-reload tricks needed.
describe('PaystackPaymentProvider', () => {
  const originalFetch = global.fetch;
  const originalSecretKey = process.env.PAYSTACK_SECRET_KEY;

  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.PAYSTACK_SECRET_KEY = originalSecretKey;
    jest.restoreAllMocks();
  });

  function baseParams(): InitiatePaymentParams {
    return {
      organisationId: 'org-1',
      amountValue: '25.50',
      currency: 'GHS',
      channel: 'MOBILE_MONEY',
      phoneNumber: '+233200011',
      momoProvider: 'mtn',
      metadata: { organisationId: 'org-1', reference: 'intent-1' },
    };
  }

  it('throws at construction if PAYSTACK_SECRET_KEY is not set', () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(() => new PaystackPaymentProvider()).toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it('builds the charge request correctly and maps a successful response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: true,
          message: 'Charge attempted',
          data: {
            reference: 'intent-1',
            status: 'pay_offline',
            display_text: 'Please dial *170# and approve the payment.',
          },
        }),
    });
    global.fetch = fetchMock;

    const provider = new PaystackPaymentProvider();
    const result = await provider.initiatePayment(baseParams());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/charge');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_test_123' });

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.amount).toBe(2550); // GHS 25.50 -> 2550 pesewas
    expect(body.currency).toBe('GHS');
    expect(body.reference).toBe('intent-1');
    expect(body.mobile_money).toEqual({ phone: '+233200011', provider: 'mtn' });
    expect(body.metadata).toEqual({ organisationId: 'org-1' });
    expect(body.email).toBe('member.intent-1@example.com');

    expect(result).toEqual({
      providerReference: 'intent-1',
      displayText: 'Please dial *170# and approve the payment.',
    });
  });

  it('throws when Paystack reports failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ status: false, message: 'Insufficient funds' }),
    });

    const provider = new PaystackPaymentProvider();
    await expect(provider.initiatePayment(baseParams())).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('throws for a channel it does not yet support', async () => {
    const provider = new PaystackPaymentProvider();
    await expect(
      provider.initiatePayment({ ...baseParams(), channel: 'CARD' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('throws a client error (not a server error) when momoProvider is missing', async () => {
    const provider = new PaystackPaymentProvider();
    await expect(
      provider.initiatePayment({ ...baseParams(), momoProvider: undefined }),
    ).rejects.toThrow(BadRequestException);
  });
});
