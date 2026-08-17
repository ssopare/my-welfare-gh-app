import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsBalance,
  SendSmsParams,
  SendSmsResult,
  SmsProvider,
} from './sms-provider.interface';

const ARKESEL_SEND_URL = 'https://sms.arkesel.com/api/v2/sms/send';
const ARKESEL_BALANCE_URL = 'https://sms.arkesel.com/api/v2/clients/balance-details';

@Injectable()
export class ArkeselSmsProvider implements SmsProvider {
  readonly name = 'ARKESEL' as const;
  readonly tier = 1; // Primary Provider
  private readonly logger = new Logger(ArkeselSmsProvider.name);

  private get apiKey(): string | undefined {
    return process.env.ARKESEL_API_KEY;
  }

  private get defaultSenderId(): string {
    return process.env.ARKESEL_SENDER_ID || 'WELFARE';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async getBalance(): Promise<SmsBalance> {
    if (!this.isConfigured()) {
      return {
        provider: 'ARKESEL',
        displayName: 'Arkesel (Primary)',
        isConfigured: false,
        smsUnits: 0,
        status: 'UNCONFIGURED',
        tier: 1,
      };
    }

    try {
      const response = await fetch(ARKESEL_BALANCE_URL, {
        method: 'GET',
        headers: {
          'api-key': this.apiKey!,
        },
      });

      if (!response.ok) {
        throw new Error(`Arkesel HTTP ${response.status}: ${response.statusText}`);
      }

      const body = (await response.json()) as {
        status: string;
        data?: {
          sms_balance?: number;
          main_balance?: string;
        };
      };

      const smsUnits = body.data?.sms_balance ?? 0;
      const mainBalance = body.data?.main_balance ?? 'GHS 0.00';

      return {
        provider: 'ARKESEL',
        displayName: 'Arkesel (Primary)',
        isConfigured: true,
        smsUnits,
        mainBalanceValue: mainBalance,
        currency: 'GHS',
        status: smsUnits > 100 ? 'ACTIVE' : smsUnits > 0 ? 'LOW_BALANCE' : 'EXHAUSTED',
        tier: 1,
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch Arkesel balance: ${err?.message}`);
      return {
        provider: 'ARKESEL',
        displayName: 'Arkesel (Primary)',
        isConfigured: true,
        smsUnits: 0,
        status: 'ERROR',
        tier: 1,
        error: err?.message || 'Connection error',
      };
    }
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: 'ARKESEL',
        unitsUsed: 0,
        status: 'FAILED',
        error: 'Arkesel API key is not configured',
      };
    }

    try {
      const formattedPhone = params.to.replace(/[-\s()]/g, '');
      const response = await fetch(ARKESEL_SEND_URL, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: params.senderId || this.defaultSenderId,
          message: params.message,
          recipients: [formattedPhone],
        }),
      });

      const body = (await response.json()) as {
        status: string;
        message?: string;
        data?: Array<{ id?: string; recipient?: string }>;
      };

      if (!response.ok || body.status !== 'success') {
        throw new Error(body.message || `Arkesel dispatch failed with status ${response.status}`);
      }

      const messageId = body.data?.[0]?.id || `arkesel_${Date.now()}`;
      return {
        success: true,
        provider: 'ARKESEL',
        messageId,
        unitsUsed: 1,
        status: 'DELIVERED',
      };
    } catch (err: any) {
      this.logger.error(`Arkesel send failed: ${err?.message}`);
      return {
        success: false,
        provider: 'ARKESEL',
        unitsUsed: 0,
        status: 'FAILED',
        error: err?.message || 'Arkesel dispatch failed',
      };
    }
  }
}
