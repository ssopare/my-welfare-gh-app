import { SmsService } from './sms.service';
import type { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
import type { MnotifySmsProvider } from './providers/mnotify-sms.provider';
import type { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import type { MockSmsProvider } from './providers/mock-sms.provider';
import type { SmsProvider } from './providers/sms-provider.interface';
import type { PrismaService } from '../prisma/prisma.service';

// Mocked against the plain SmsProvider interface, not the concrete
// classes — the classes carry a private `logger` field, which breaks
// structural typing for a plain object literal and previously forced an
// `as any` cast on every mock here. SmsService's constructor parameter
// types (ArkeselSmsProvider, etc.) still accept these at the call site
// below since only the constructor's declared *parameter* type matters
// for the call, not this variable's own declared type.
type MockProvider = jest.Mocked<SmsProvider>;

function buildMockProvider(
  name: SmsProvider['name'],
  tier: number,
): MockProvider {
  return {
    name,
    tier,
    isConfigured: jest.fn().mockReturnValue(true),
    getBalance: jest.fn(),
    sendSms: jest.fn(),
  };
}

describe('SmsService (Multi-Tier Failover Engine)', () => {
  let smsService: SmsService;
  let smsLogCreate: jest.Mock;
  let mockPrisma: Pick<PrismaService, 'withTenant'>;
  let mockArkesel: MockProvider;
  let mockMnotify: MockProvider;
  let mockHubtel: MockProvider;
  let mockMockProvider: MockProvider;

  beforeEach(() => {
    smsLogCreate = jest.fn().mockResolvedValue({ id: 'log-1' });
    const tx = {
      smsLog: {
        create: smsLogCreate,
        findMany: jest.fn().mockResolvedValue([]),
      },
      member: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // Real PrismaService.withTenant runs the callback inside a
    // SET-LOCAL-app.tenant_id transaction — the mock just invokes it
    // directly against a fake tx, which is all SmsService's own logic
    // (never PrismaService's) needs exercised here.
    mockPrisma = {
      withTenant: jest.fn(
        (_organisationId: string, callback: (tx: unknown) => unknown) =>
          Promise.resolve(callback(tx)),
      ),
    } as Pick<PrismaService, 'withTenant'>;

    mockArkesel = buildMockProvider('ARKESEL', 1);
    mockArkesel.getBalance.mockResolvedValue({
      provider: 'ARKESEL',
      displayName: 'Arkesel (Primary)',
      isConfigured: true,
      smsUnits: 1500,
      mainBalanceValue: 'GHS 45.00',
      status: 'ACTIVE',
      tier: 1,
    });

    mockMnotify = buildMockProvider('MNOTIFY', 2);
    mockMnotify.getBalance.mockResolvedValue({
      provider: 'MNOTIFY',
      displayName: 'mNotify (Fallback)',
      isConfigured: true,
      smsUnits: 800,
      status: 'ACTIVE',
      tier: 2,
    });

    mockHubtel = buildMockProvider('HUBTEL', 3);
    mockHubtel.getBalance.mockResolvedValue({
      provider: 'HUBTEL',
      displayName: 'Hubtel (Enterprise)',
      isConfigured: true,
      smsUnits: 5000,
      status: 'ACTIVE',
      tier: 3,
    });

    mockMockProvider = buildMockProvider('MOCK', 99);
    mockMockProvider.getBalance.mockResolvedValue({
      provider: 'MOCK',
      displayName: 'Development Simulator',
      isConfigured: true,
      smsUnits: 1000,
      status: 'ACTIVE',
      tier: 99,
    });

    smsService = new SmsService(
      mockPrisma as PrismaService,
      mockArkesel as unknown as ArkeselSmsProvider,
      mockMnotify as unknown as MnotifySmsProvider,
      mockHubtel as unknown as HubtelSmsProvider,
      mockMockProvider as unknown as MockSmsProvider,
    );
  });

  it('dispatches via Arkesel (Primary) when healthy and configured', async () => {
    mockArkesel.sendSms.mockResolvedValue({
      success: true,
      provider: 'ARKESEL',
      messageId: 'ark_123',
      unitsUsed: 1,
      status: 'DELIVERED',
    });

    const result = await smsService.sendSms({
      to: '0244111222',
      message: 'Hello test',
      organisationId: 'org-1',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('ARKESEL');
    expect(mockArkesel.sendSms).toHaveBeenCalledTimes(1);
    expect(mockMnotify.sendSms).not.toHaveBeenCalled();
    expect(mockHubtel.sendSms).not.toHaveBeenCalled();
    expect(smsLogCreate).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining's @types/jest signature returns `any`
      data: expect.objectContaining({
        organisationId: 'org-1',
        phoneNumber: '0244111222',
        provider: 'ARKESEL',
        status: 'DELIVERED',
      }),
    });
  });

  it('automatically fails over to mNotify (Tier 2) when Arkesel fails', async () => {
    // Arkesel fails
    mockArkesel.sendSms.mockResolvedValue({
      success: false,
      provider: 'ARKESEL',
      unitsUsed: 0,
      status: 'FAILED',
      error: 'Insufficient credits on Arkesel',
    });

    // mNotify succeeds
    mockMnotify.sendSms.mockResolvedValue({
      success: true,
      provider: 'MNOTIFY',
      messageId: 'mnot_456',
      unitsUsed: 1,
      status: 'DELIVERED',
    });

    const result = await smsService.sendSms({
      to: '0244111222',
      message: 'Payment confirmation receipt',
      organisationId: 'org-1',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('MNOTIFY');
    expect(mockArkesel.sendSms).toHaveBeenCalledTimes(1);
    expect(mockMnotify.sendSms).toHaveBeenCalledTimes(1);
    expect(mockHubtel.sendSms).not.toHaveBeenCalled();
    expect(smsLogCreate).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining's @types/jest signature returns `any`
      data: expect.objectContaining({
        organisationId: 'org-1',
        phoneNumber: '0244111222',
        provider: 'MNOTIFY',
        status: 'DELIVERED',
      }),
    });
  });

  it('fails over to Hubtel (Tier 3) when both Arkesel and mNotify fail', async () => {
    mockArkesel.sendSms.mockRejectedValue(new Error('Arkesel network timeout'));
    mockMnotify.sendSms.mockResolvedValue({
      success: false,
      provider: 'MNOTIFY',
      unitsUsed: 0,
      status: 'FAILED',
      error: 'mNotify DND error',
    });
    mockHubtel.sendSms.mockResolvedValue({
      success: true,
      provider: 'HUBTEL',
      messageId: 'hub_789',
      unitsUsed: 1,
      status: 'DELIVERED',
    });

    const result = await smsService.sendSms({
      to: '0244111222',
      message: 'Urgent meeting notice',
      organisationId: 'org-1',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('HUBTEL');
    expect(mockArkesel.sendSms).toHaveBeenCalledTimes(1);
    expect(mockMnotify.sendSms).toHaveBeenCalledTimes(1);
    expect(mockHubtel.sendSms).toHaveBeenCalledTimes(1);
  });

  it('generates and verifies 6-digit OTP codes correctly', async () => {
    mockArkesel.sendSms.mockResolvedValue({
      success: true,
      provider: 'ARKESEL',
      messageId: 'otp_123',
      unitsUsed: 1,
      status: 'DELIVERED',
    });

    const sendRes = await smsService.sendOtp('org-1', '0244111222');
    expect(sendRes.success).toBe(true);

    const sentMessage = mockArkesel.sendSms.mock.calls[0][0].message;
    const otpCode = sentMessage.match(/\d{6}/)?.[0];
    expect(otpCode).toBeDefined();

    // Verification with valid code
    const isValid = smsService.verifyOtp('0244111222', otpCode!);
    expect(isValid).toBe(true);

    // Cannot reuse already-consumed code
    const isReusedValid = smsService.verifyOtp('0244111222', otpCode!);
    expect(isReusedValid).toBe(false);
  });

  it('aggregates live gateway balance summary across all providers', async () => {
    const summary = await smsService.getGatewaySummary();

    expect(summary.primaryProvider).toBe('ARKESEL');
    expect(summary.fallbackProvider).toBe('MNOTIFY');
    expect(summary.totalAvailableSms).toBe(7300); // 1500 + 800 + 5000
    expect(summary.isHealthy).toBe(true);
    expect(summary.providers.length).toBe(3);
  });
});
