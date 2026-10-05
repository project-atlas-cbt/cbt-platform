import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatSender,
  type Env,
  type PlatformSettings,
  type PlatformSettingsEnv,
  type ResolvedPlatformSettings,
} from '@atlas/config';
import { createPlatformSettingsReader, prisma, type PlatformSettingsReader } from '@atlas/db';

export function platformSettingsEnv(config: ConfigService<Env, true>): PlatformSettingsEnv {
  const get = <K extends keyof PlatformSettingsEnv>(key: K) => config.get(key, { infer: true });
  return {
    PRODUCT_NAME: get('PRODUCT_NAME'),
    NOTIFICATION_TRANSPORT: get('NOTIFICATION_TRANSPORT'),
    OPS_ALERT_EMAILS: get('OPS_ALERT_EMAILS'),
    SMTP_FROM_ADDRESS: get('SMTP_FROM_ADDRESS'),
    SES_FROM_ADDRESS: get('SES_FROM_ADDRESS'),
    DEFAULT_SCHOOL_TIMEZONE: get('DEFAULT_SCHOOL_TIMEZONE'),
    PLATFORM_SESSION_TTL_SECONDS: get('PLATFORM_SESSION_TTL_SECONDS'),
    PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS: get('PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS'),
    SESSION_TTL_SECONDS: get('SESSION_TTL_SECONDS'),
    AUTH_LOCKOUT_MAX_ATTEMPTS: get('AUTH_LOCKOUT_MAX_ATTEMPTS'),
    AUTH_LOCKOUT_WINDOW_SECONDS: get('AUTH_LOCKOUT_WINDOW_SECONDS'),
    PASSWORD_RESET_TOKEN_TTL_SECONDS: get('PASSWORD_RESET_TOKEN_TTL_SECONDS'),
  };
}

/**
 * ADR-0036: the platform settings in effect for this process — the env
 * defaults with any System Configuration changes laid over them, cached
 * for 30 seconds. Every consumer of an editable setting reads it here,
 * never from ConfigService, so a console change reaches it without a
 * restart.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private readonly reader: PlatformSettingsReader;
  readonly env: PlatformSettingsEnv;

  constructor(config: ConfigService<Env, true>) {
    this.env = platformSettingsEnv(config);
    this.reader = createPlatformSettingsReader(prisma, this.env, {
      onError: (error) =>
        this.logger.warn(`Platform settings unreadable; using env values: ${String(error)}`),
    });
  }

  async current(): Promise<PlatformSettings> {
    return (await this.reader.get()).values;
  }

  resolved(): Promise<ResolvedPlatformSettings> {
    return this.reader.get();
  }

  /** The From header for outgoing email (sender name and address). */
  async sender(): Promise<string> {
    return formatSender(await this.current());
  }

  invalidate(): void {
    this.reader.invalidate();
  }
}

@Global()
@Module({ providers: [PlatformSettingsService], exports: [PlatformSettingsService] })
export class PlatformSettingsModule {}
