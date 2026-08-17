export interface SmsBalance {
  provider: 'ARKESEL' | 'MNOTIFY' | 'HUBTEL' | 'MOCK';
  displayName: string;
  isConfigured: boolean;
  smsUnits: number;
  mainBalanceValue?: string;
  currency?: string;
  bonusUnits?: number;
  status: 'ACTIVE' | 'LOW_BALANCE' | 'EXHAUSTED' | 'UNCONFIGURED' | 'ERROR';
  tier: number;
  error?: string;
  // True when the provider has no real balance-check API at all (Hubtel
  // — its SMS billing draws from a shared merchant wallet with no
  // documented "remaining SMS units" endpoint, confirmed against their
  // public docs). smsUnits is 0 in that case, not a real reading — the
  // UI must not treat it as "exhausted", and totals/health calculations
  // that sum smsUnits across providers should exclude it.
  balanceUnavailable?: boolean;
}

export interface SendSmsParams {
  to: string; // e.g. "0244123456" or "+233244123456"
  message: string;
  senderId?: string;
  type?: 'OTP' | 'TRANSACTIONAL' | 'BROADCAST' | 'REMINDER';
  // Required, not optional — SmsService.sendSms writes an audit log
  // through PrismaService.withTenant, which needs a real tenant to scope
  // to. The individual provider classes (Arkesel/mNotify/Hubtel/Mock)
  // never read this themselves; it only matters to SmsService's own log
  // write.
  organisationId: string;
}

export interface SendSmsResult {
  success: boolean;
  provider: 'ARKESEL' | 'MNOTIFY' | 'HUBTEL' | 'MOCK';
  messageId?: string;
  unitsUsed: number;
  status: 'DELIVERED' | 'SENT' | 'FAILED';
  error?: string;
}

export interface SmsProvider {
  readonly name: 'ARKESEL' | 'MNOTIFY' | 'HUBTEL' | 'MOCK';
  readonly tier: number;
  // Declared as property function types (not method shorthand) so a
  // jest.Mocked<SmsProvider> object's members read as plain properties —
  // method-shorthand signatures make @typescript-eslint/unbound-method
  // flag bare `expect(mock.sendSms)` references in tests as unsafely
  // unbound. Implementing classes are unaffected either way.
  isConfigured: () => boolean;
  getBalance: () => Promise<SmsBalance>;
  sendSms: (params: SendSmsParams) => Promise<SendSmsResult>;
}
