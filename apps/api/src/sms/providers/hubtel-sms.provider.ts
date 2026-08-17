import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsBalance,
  SendSmsParams,
  SendSmsResult,
  SmsProvider,
} from './sms-provider.interface';

const HUBTEL_SEND_URL = 'https://sms.hubtel.com/v1/messages/send';

@Injectable()
export class HubtelSmsProvider implements SmsProvider {
  readonly name = 'HUBTEL' as const;
  readonly tier = 3; // Enterprise Backup Provider
  private readonly logger = new Logger(HubtelSmsProvider.name);

  private get clientId(): string | undefined {
    return process.env.HUBTEL_CLIENT_ID;
  }

  private get clientSecret(): string | undefined {
    return process.env.HUBTEL_CLIENT_SECRET;
  }

  private get defaultSenderId(): string {
    return process.env.HUBTEL_SENDER_ID || 'WELFARE';
  }

  isConfigured(): boolean {
    return Boolean(
      this.clientId &&
      this.clientId.trim().length > 0 &&
      this.clientSecret &&
      this.clientSecret.trim().length > 0,
    );
  }

  private get basicAuthHeader(): string {
    const creds = `${this.clientId}:${this.clientSecret}`;
    return `Basic ${Buffer.from(creds).toString('base64')}`;
  }

  getBalance(): Promise<SmsBalance> {
    if (!this.isConfigured()) {
      return Promise.resolve({
        provider: 'HUBTEL',
        displayName: 'Hubtel (Enterprise)',
        isConfigured: false,
        smsUnits: 0,
        status: 'UNCONFIGURED',
        tier: 3,
      });
    }

    // Unlike Arkesel/mNotify (SMS-only credit systems with a documented
    // balance endpoint each), Hubtel SMS billing draws from a shared
    // merchant wallet used across all of Hubtel's services — there is no
    // documented "remaining SMS units" API to call (confirmed against
    // their public developer docs). Reporting a real HTTP-derived number
    // here would mean making one up; reporting balanceUnavailable is the
    // honest alternative — configured and able to send, balance genuinely
    // unknown until Hubtel documents/ships an endpoint for it.
    return Promise.resolve({
      provider: 'HUBTEL',
      displayName: 'Hubtel (Enterprise)',
      isConfigured: true,
      smsUnits: 0,
      mainBalanceValue: 'Check the Hubtel dashboard directly',
      status: 'ACTIVE',
      tier: 3,
      balanceUnavailable: true,
    });
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: 'HUBTEL',
        unitsUsed: 0,
        status: 'FAILED',
        error: 'Hubtel ClientId or ClientSecret is not configured',
      };
    }

    try {
      const formattedPhone = params.to.replace(/[-\s()]/g, '');
      const response = await fetch(HUBTEL_SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: this.basicAuthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: params.senderId || this.defaultSenderId,
          To: formattedPhone,
          Content: params.message,
          RegisteredDelivery: true,
        }),
      });

      const body = (await response.json()) as {
        status?: number;
        messageId?: string;
        message?: string;
      };

      if (!response.ok || (body.status !== undefined && body.status !== 0)) {
        throw new Error(
          body.message || `Hubtel dispatch returned status ${response.status}`,
        );
      }

      return {
        success: true,
        provider: 'HUBTEL',
        messageId: body.messageId || `hubtel_${Date.now()}`,
        unitsUsed: 1,
        status: 'DELIVERED',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Hubtel send failed: ${message}`);
      return {
        success: false,
        provider: 'HUBTEL',
        unitsUsed: 0,
        status: 'FAILED',
        error: message || 'Hubtel dispatch failed',
      };
    }
  }
}
