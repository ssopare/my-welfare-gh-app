import { SmsService } from './sms.service';
import { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
import { MnotifySmsProvider } from './providers/mnotify-sms.provider';
import { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';

describe('SmsService (Multi-Tier Failover Engine)', () => {
  let smsService: SmsService;
  let mockPrisma: any;
  let mockArkesel: jest.Mocked<ArkeselSmsProvider>;
  let mockMnotify: jest.Mocked<MnotifySmsProvider>;
  let mockHubtel: jest.Mocked<HubtelSmsProvider>;
  let mockMockProvider: jest.Mocked<MockSmsProvider>;

  beforeEach(() => {
    mockPrisma = {
      smsLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      member: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockArkesel = {
      name: 'ARKESEL',
      tier: 1,
      isConfigured: jest.fn().mockReturnValue(true),
      getBalance: jest.fn().mockResolvedValue({
        provider: 'ARKESEL',
        displayName: 'Arkesel (Primary)',
        isConfigured: true,
        smsUnits: 1500,
        mainBalanceValue: 'GHS 45.00',
        status: 'ACTIVE',
        tier: 1,
      }),
      sendSms: jest.fn(),
    } as any;

    mockMnotify = {
      name: 'MNOTIFY',
      tier: 2,
      isConfigured: jest.fn().mockReturnValue(true),
      getBalance: jest.fn().mockResolvedValue({
        provider: 'MNOTIFY',
        displayName: 'mNotify (Fallback)',
        isConfigured: true,
        smsUnits: 800,
        status: 'ACTIVE',
        tier: 2,
      }),
      sendSms: jest.fn(),
    } as any;

    mockHubtel = {
      name: 'HUBTEL',
      tier: 3,
      isConfigured: jest.fn().mockReturnValue(true),
      getBalance: jest.fn().mockResolvedValue({
        provider: 'HUBTEL',
        displayName: 'Hubtel (Enterprise)',
        isConfigured: true,
        smsUnits: 5000,
        status: 'ACTIVE',
        tier: 3,
      }),
      sendSms: jest.fn(),
    } as any;

    mockMockProvider = {
      name: 'MOCK',
      tier: 99,
      isConfigured: jest.fn().mockReturnValue(true),
      getBalance: jest.fn().mockResolvedValue({
        provider: 'MOCK',
        displayName: 'Development Simulator',
        isConfigured: true,
        smsUnits: 1000,
        status: 'ACTIVE',
        tier: 99,
      }),
      sendSms: jest.fn(),
    } as any;

    smsService = new SmsService(
      mockPrisma,
      mockArkesel,
      mockMnotify,
      mockHubtel,
      mockMockProvider,
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
    expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
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
    expect(mockPrisma.smsLog.create).toHaveBeenCalledWith({
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
