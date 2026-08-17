import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsBalance,
  SendSmsParams,
  SendSmsResult,
  SmsProvider,
} from './sms-provider.interface';

const MNOTIFY_SEND_URL = 'https://api.mnotify.com/api/sms/quick';
const MNOTIFY_BALANCE_URL = 'https://api.mnotify.com/api/balance/sms';

// mNotify's documented API only accepts the key as a `?key=` query
// parameter — there's no header-based auth option, unlike Arkesel
// ('api-key' header) or Hubtel (Basic Auth header). That's a genuinely
// weaker key-handling posture (a query string can end up in proxy/access
// logs a header wouldn't), but it's not something this code can fix
// unilaterally — it's mNotify's own API contract. Flagging it here so
// nobody "cleans up" this pattern into a header call that mNotify will
// just reject; if this is a real operational concern, run it behind a
// proxy that strips query strings from its own access logs.
@Injectable()
export class MnotifySmsProvider implements SmsProvider {
  readonly name = 'MNOTIFY' as const;
  readonly tier = 2; // Fallback Provider
  private readonly logger = new Logger(MnotifySmsProvider.name);

  private get apiKey(): string | undefined {
    return process.env.MNOTIFY_API_KEY;
  }

  private get defaultSenderId(): string {
    return process.env.MNOTIFY_SENDER_ID || 'WELFARE';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async getBalance(): Promise<SmsBalance> {
    if (!this.isConfigured()) {
      return {
        provider: 'MNOTIFY',
        displayName: 'mNotify (Fallback)',
        isConfigured: false,
        smsUnits: 0,
        status: 'UNCONFIGURED',
        tier: 2,
      };
    }

    try {
      const url = `${MNOTIFY_BALANCE_URL}?key=${encodeURIComponent(this.apiKey!)}`;
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error(
          `mNotify HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const body = (await response.json()) as {
        status: string;
        balance?: number;
        bonus?: number;
      };

      const smsUnits = body.balance ?? 0;
      const bonusUnits = body.bonus ?? 0;

      return {
        provider: 'MNOTIFY',
        displayName: 'mNotify (Fallback)',
        isConfigured: true,
        smsUnits,
        bonusUnits,
        status:
          smsUnits > 100
            ? 'ACTIVE'
            : smsUnits > 0
              ? 'LOW_BALANCE'
              : 'EXHAUSTED',
        tier: 2,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to fetch mNotify balance: ${message}`);
      return {
        provider: 'MNOTIFY',
        displayName: 'mNotify (Fallback)',
        isConfigured: true,
        smsUnits: 0,
        status: 'ERROR',
        tier: 2,
        error: message || 'Connection error',
      };
    }
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: 'MNOTIFY',
        unitsUsed: 0,
        status: 'FAILED',
        error: 'mNotify API key is not configured',
      };
    }

    try {
      const formattedPhone = params.to.replace(/[-\s()]/g, '');
      const url = `${MNOTIFY_SEND_URL}?key=${encodeURIComponent(this.apiKey!)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: [formattedPhone],
          sender: params.senderId || this.defaultSenderId,
          message: params.message,
          is_schedule: 'false',
        }),
      });

      const body = (await response.json()) as {
        status: string;
        message?: string;
        summary?: { _id?: string };
      };

      if (!response.ok || body.status !== 'success') {
        throw new Error(
          body.message ||
            `mNotify dispatch failed with status ${response.status}`,
        );
      }

      const messageId = body.summary?._id || `mnotify_${Date.now()}`;
      return {
        success: true,
        provider: 'MNOTIFY',
        messageId,
        unitsUsed: 1,
        status: 'DELIVERED',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`mNotify send failed: ${message}`);
      return {
        success: false,
        provider: 'MNOTIFY',
        unitsUsed: 0,
        status: 'FAILED',
        error: message || 'mNotify dispatch failed',
      };
    }
  }
}
