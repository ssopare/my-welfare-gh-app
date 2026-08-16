import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaystackTransferProvider } from './paystack-transfer-provider.service';
import type {
  CreateTransferRecipientParams,
  InitiateTransferParams,
} from './transfer-provider.interface';

// Plain unit test, not e2e — same reasoning as
// paystack-payment-provider.spec.ts: mocks the network boundary (global
// fetch) rather than hitting Paystack for real, since no live credentials
// exist for this project.
describe('PaystackTransferProvider', () => {
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

  function recipientParams(): CreateTransferRecipientParams {
    return {
      organisationId: 'org-1',
      name: 'Test Welfare Org',
      accountNumber: '0559998887',
      momoProvider: 'mtn',
      currency: 'GHS',
    };
  }

  function transferParams(): InitiateTransferParams {
    return {
      organisationId: 'org-1',
      recipientCode: 'RCP_abc123',
      amountValue: '95.00',
      currency: 'GHS',
      reference: 'auto-disb-1',
      reason: 'Auto-disbursement for contribution intent-1',
      metadata: { organisationId: 'org-1', autoDisbursementId: 'auto-disb-1' },
    };
  }

  it('throws at construction if PAYSTACK_SECRET_KEY is not set', () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(() => new PaystackTransferProvider()).toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it('builds the recipient request correctly and maps a successful response', async () => {
    const fetchMock = jest
      .fn()
      // 1st call: the best-effort GET /bank/resolve
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            data: { account_name: 'Test Welfare Org' },
          }),
      })
      // 2nd call: the real POST /transferrecipient
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: 'Recipient created',
            data: { recipient_code: 'RCP_abc123' },
          }),
      });
    global.fetch = fetchMock;

    const provider = new PaystackTransferProvider();
    const result = await provider.createRecipient(recipientParams());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [recipientUrl, recipientInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(recipientUrl).toBe('https://api.paystack.co/transferrecipient');
    expect(recipientInit.headers).toMatchObject({
      Authorization: 'Bearer sk_test_123',
    });
    const body = JSON.parse(recipientInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      type: 'mobile_money',
      name: 'Test Welfare Org',
      account_number: '0559998887',
      bank_code: 'MTN', // mapped from momoProvider: 'mtn'
      currency: 'GHS',
    });

    expect(result).toEqual({ recipientCode: 'RCP_abc123', verified: true });
  });

  it('still creates the recipient even when the best-effort resolve call fails — advisory, not blocking', async () => {
    const fetchMock = jest
      .fn()
      // resolve fails outright (network error)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      // recipient creation still proceeds and succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            message: 'Recipient created',
            data: { recipient_code: 'RCP_xyz789' },
          }),
      });
    global.fetch = fetchMock;

    const provider = new PaystackTransferProvider();
    const result = await provider.createRecipient(recipientParams());

    expect(result).toEqual({ recipientCode: 'RCP_xyz789', verified: true });
  });

  it('throws when Paystack rejects recipient creation', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: true, data: {} }),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: () =>
          Promise.resolve({ status: false, message: 'Invalid account number' }),
      });

    const provider = new PaystackTransferProvider();
    await expect(provider.createRecipient(recipientParams())).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('builds the transfer request correctly, converts to pesewas, and always reports pending', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: true,
          message: 'Transfer queued',
          data: { reference: 'auto-disb-1', status: 'pending' },
        }),
    });
    global.fetch = fetchMock;

    const provider = new PaystackTransferProvider();
    const result = await provider.initiateTransfer(transferParams());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transfer');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.source).toBe('balance');
    expect(body.amount).toBe(9500); // GHS 95.00 -> 9500 pesewas
    expect(body.recipient).toBe('RCP_abc123');
    expect(body.reference).toBe('auto-disb-1');

    // Always 'pending' — a real transfer only ever confirms via a later
    // webhook, never synchronously on this call (see the interface's own
    // comment on InitiateTransferResult.status).
    expect(result).toEqual({
      providerReference: 'auto-disb-1',
      status: 'pending',
    });
  });

  it('throws when Paystack rejects the transfer', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ status: false, message: 'Insufficient balance' }),
    });

    const provider = new PaystackTransferProvider();
    await expect(provider.initiateTransfer(transferParams())).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('throws a clear 503 (not a bare 500) when the network itself fails during a transfer', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new TypeError('fetch failed', {
        cause: { code: 'ENOTFOUND', hostname: 'api.paystack.co' },
      }),
    );

    const provider = new PaystackTransferProvider();
    await expect(provider.initiateTransfer(transferParams())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
