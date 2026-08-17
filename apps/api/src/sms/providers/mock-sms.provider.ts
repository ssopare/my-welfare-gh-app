import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsBalance,
  SendSmsParams,
  SendSmsResult,
  SmsProvider,
} from './sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'MOCK' as const;
  readonly tier = 99;
  private readonly logger = new Logger(MockSmsProvider.name);
  private unitsLeft = 1000;

  isConfigured(): boolean {
    return true;
  }

  async getBalance(): Promise<SmsBalance> {
    return {
      provider: 'MOCK',
      displayName: 'Development Simulator',
      isConfigured: true,
      smsUnits: this.unitsLeft,
      mainBalanceValue: `GHS ${(this.unitsLeft * 0.03).toFixed(2)}`,
      currency: 'GHS',
      status: 'ACTIVE',
      tier: 99,
    };
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    this.unitsLeft = Math.max(0, this.unitsLeft - 1);
    this.logger.log(
      `[SIMULATOR SMS to ${params.to}] "${params.message}" (Type: ${params.type || 'TRANSACTIONAL'})`,
    );
    return {
      success: true,
      provider: 'MOCK',
      messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      unitsUsed: 1,
      status: 'DELIVERED',
    };
  }
}
