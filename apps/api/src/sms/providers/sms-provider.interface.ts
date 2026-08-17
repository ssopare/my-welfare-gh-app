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
}

export interface SendSmsParams {
  to: string; // e.g. "0244123456" or "+233244123456"
  message: string;
  senderId?: string;
  type?: 'OTP' | 'TRANSACTIONAL' | 'BROADCAST' | 'REMINDER';
  organisationId?: string;
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
  isConfigured(): boolean;
  getBalance(): Promise<SmsBalance>;
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;
}
