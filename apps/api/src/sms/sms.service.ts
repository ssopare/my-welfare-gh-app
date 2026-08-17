import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
import { MnotifySmsProvider } from './providers/mnotify-sms.provider';
import { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';
import type {
  SmsBalance,
  SendSmsParams,
  SendSmsResult,
  SmsProvider,
} from './providers/sms-provider.interface';

interface StoredOtp {
  code: string;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly providers: SmsProvider[];
  private readonly otpStore = new Map<string, StoredOtp>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly arkesel: ArkeselSmsProvider,
    private readonly mnotify: MnotifySmsProvider,
    private readonly hubtel: HubtelSmsProvider,
    private readonly mock: MockSmsProvider,
  ) {
    // Priority order: Arkesel (Tier 1) -> mNotify (Tier 2) -> Hubtel (Tier 3) -> Mock (Tier 99)
    this.providers = [this.arkesel, this.mnotify, this.hubtel, this.mock];
  }

  /**
   * Retrieves active providers in priority order.
   * If any live provider is configured, returns only configured live providers;
   * otherwise falls back to the Mock provider for dev/testing.
   */
  private getActiveProviders(): SmsProvider[] {
    const liveConfigured = this.providers
      .filter((p) => p.name !== 'MOCK' && p.isConfigured())
      .sort((a, b) => a.tier - b.tier);

    if (liveConfigured.length > 0) {
      return liveConfigured;
    }
    return [this.mock];
  }

  /**
   * Sends an SMS with automatic multi-tier failover.
   * Tries Primary (Arkesel); if it fails, falls back to Tier 2 (mNotify) and Tier 3 (Hubtel).
   * Persists an audit log in the database with provider attribution.
   */
  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    const activeProviders = this.getActiveProviders();
    let lastError: string | undefined;
    let finalResult: SendSmsResult | null = null;

    for (const provider of activeProviders) {
      try {
        this.logger.log(`Attempting SMS dispatch via ${provider.name} (Tier ${provider.tier}) to ${params.to}`);
        const result = await provider.sendSms(params);

        if (result.success) {
          finalResult = result;
          this.logger.log(`SMS successfully dispatched via ${provider.name}`);
          break;
        } else {
          lastError = result.error || 'Provider returned unsuccessful status';
          this.logger.warn(`Provider ${provider.name} failed: ${lastError}. Attempting next tier...`);
        }
      } catch (err: any) {
        lastError = err?.message || 'Exception during dispatch';
        this.logger.warn(`Provider ${provider.name} threw error: ${lastError}. Attempting next tier...`);
      }
    }

    if (!finalResult) {
      finalResult = {
        success: false,
        provider: activeProviders[0]?.name || 'ARKESEL',
        unitsUsed: 0,
        status: 'FAILED',
        error: lastError || 'All SMS providers in failover pipeline failed',
      };
    }

    // Persist SMS log if organisationId is known
    if (params.organisationId) {
      try {
        await this.prisma.smsLog.create({
          data: {
            organisationId: params.organisationId,
            phoneNumber: params.to,
            messageExcerpt:
              params.message.length > 120
                ? `${params.message.slice(0, 117)}...`
                : params.message,
            type: params.type || 'TRANSACTIONAL',
            provider: finalResult.provider,
            status: finalResult.status,
            unitsUsed: finalResult.unitsUsed,
            error: finalResult.error,
          },
        });
      } catch (logErr) {
        this.logger.error(`Failed to write SmsLog: ${logErr}`);
      }
    }

    return finalResult;
  }

  /**
   * Generates and dispatches a 6-digit OTP code to the given phone number.
   * Code is valid for 5 minutes.
   */
  async sendOtp(organisationId: string, phoneNumber: string): Promise<{ success: boolean; message: string }> {
    const formattedPhone = phoneNumber.replace(/[-\s()]/g, '');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.otpStore.set(formattedPhone, {
      code,
      expiresAt,
      attempts: 0,
    });

    const message = `Your verification code is: ${code}. Valid for 5 minutes. Do not share this code with anyone.`;
    const result = await this.sendSms({
      to: formattedPhone,
      message,
      type: 'OTP',
      organisationId,
    });

    if (!result.success) {
      throw new BadRequestException(`Failed to dispatch OTP: ${result.error}`);
    }

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  /**
   * Validates an OTP code for a phone number.
   */
  verifyOtp(phoneNumber: string, code: string): boolean {
    const formattedPhone = phoneNumber.replace(/[-\s()]/g, '');

    // Allow mock code in development
    if (code === '123456' && process.env.NODE_ENV !== 'production') {
      return true;
    }

    const stored = this.otpStore.get(formattedPhone);
    if (!stored) {
      return false;
    }

    if (Date.now() > stored.expiresAt) {
      this.otpStore.delete(formattedPhone);
      return false;
    }

    stored.attempts += 1;
    if (stored.attempts > 5) {
      this.otpStore.delete(formattedPhone);
      return false;
    }

    if (stored.code === code.trim()) {
      this.otpStore.delete(formattedPhone);
      return true;
    }

    return false;
  }

  /**
   * Aggregates real-time balances, tier assignments, and health status for all providers.
   */
  async getGatewaySummary() {
    const balancePromises = this.providers
      .filter((p) => p.name !== 'MOCK' || !this.providers.some((x) => x.name !== 'MOCK' && x.isConfigured()))
      .map((p) => p.getBalance());

    const providerBalances = await Promise.all(balancePromises);
    const totalAvailableSms = providerBalances.reduce((sum, p) => sum + (p.smsUnits || 0), 0);
    const activeProviders = providerBalances.filter((p) => p.isConfigured && p.status !== 'ERROR');

    const primary = activeProviders[0]?.provider || 'ARKESEL';
    const fallback = activeProviders[1]?.provider || (activeProviders[0] ? activeProviders[0].provider : 'MNOTIFY');

    return {
      primaryProvider: primary,
      fallbackProvider: fallback,
      providers: providerBalances,
      totalAvailableSms,
      lowBalanceThreshold: 200,
      isHealthy: totalAvailableSms > 50,
    };
  }

  /**
   * Fetches recent SMS delivery logs for an organisation.
   */
  async getLogs(organisationId: string, limit = 50) {
    return this.prisma.smsLog.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Dispatches a broadcast announcement to organisation members.
   */
  async broadcastSms(
    organisationId: string,
    message: string,
    recipientGroup: 'ALL_MEMBERS' | 'ACTIVE_MEMBERS' | 'DEFAULTERS',
  ) {
    let whereClause: any = { organisationId };
    if (recipientGroup === 'ACTIVE_MEMBERS') {
      whereClause.status = 'ACTIVE';
    } else if (recipientGroup === 'DEFAULTERS') {
      whereClause.status = 'IN_ARREARS';
    }

    const members = await this.prisma.member.findMany({
      where: whereClause,
      include: { account: true },
    });

    const phoneNumbers = members
      .map((m) => m.account?.phoneNumber)
      .filter((phone): phone is string => Boolean(phone && phone.trim().length > 0));

    if (phoneNumbers.length === 0) {
      throw new NotFoundException('No members with valid phone numbers found for this group');
    }

    let successCount = 0;
    let failCount = 0;

    for (const phone of phoneNumbers) {
      const result = await this.sendSms({
        to: phone,
        message,
        type: 'BROADCAST',
        organisationId,
      });

      if (result.success) successCount++;
      else failCount++;
    }

    return {
      totalRecipients: phoneNumbers.length,
      successCount,
      failCount,
    };
  }
}
