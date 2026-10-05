import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@atlas/db';
import {
  PLATFORM_SETTING_DEFINITIONS,
  platformSettingDefaults,
  platformSettingDefinition,
  validatePlatformSetting,
  type Env,
  type PlatformSettingDefinition,
  type PlatformSettingKey,
  type PlatformSettings,
} from '@atlas/config';
import type { NotificationChannel } from '@atlas/notifications';
import { AppHttpException } from '../../common/app-http-exception.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import {
  PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
  PLATFORM_TEST_EMAIL_TEMPLATE_NAME,
} from './admin-templates.js';
import type {
  PlatformSettingChangeDto,
  PlatformSettingsResponseDto,
} from './dto/platform-settings.dto.js';

export const PLATFORM_SETTING_CHANGED_ACTION = 'PLATFORM_SETTING_CHANGED';

type SettingValue = PlatformSettings[PlatformSettingKey];

const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400 } as const;

/** A value as a person reads it: `30 minutes`, `ops@x.com, b@y.com`. */
export function describeSettingValue(def: PlatformSettingDefinition, value: SettingValue): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'nobody';
  if (def.kind === 'duration' && typeof value === 'number') {
    const unit =
      value % UNIT_SECONDS.days === 0 && value >= UNIT_SECONDS.days
        ? 'days'
        : value % UNIT_SECONDS.hours === 0 && value >= UNIT_SECONDS.hours
          ? 'hours'
          : 'minutes';
    const n = Math.round((value / UNIT_SECONDS[unit]) * 100) / 100;
    return `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;
  }
  return String(value);
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * ADR-0036 System Configuration: reads the editable platform settings with
 * where each value comes from, and applies a Software Admin's changes —
 * validated against each setting's limits, audited one event per setting
 * with the reason, and announced by email to every other Software Admin.
 */
@Injectable()
export class PlatformSettingsAdminService {
  private readonly logger = new Logger(PlatformSettingsAdminService.name);

  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
  ) {}

  async list(): Promise<PlatformSettingsResponseDto> {
    const env = this.settings.env;
    const defaults = platformSettingDefaults(env);
    const rows = await prisma.platformSetting.findMany({
      include: { updatedBy: { select: { displayName: true } } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    // Read straight from the table, not the 30-second cache, so the page
    // shows a change the moment it is saved.
    const stored = rows.flatMap((r) => {
      const def = PLATFORM_SETTING_DEFINITIONS.find((d) => d.key === r.key);
      if (!def) return [];
      const checked = validatePlatformSetting(def.key, r.value, env);
      return checked.ok ? [[def.key, checked.value] as const] : [];
    });
    const effective = new Map<PlatformSettingKey, SettingValue>(stored);

    return {
      settings: PLATFORM_SETTING_DEFINITIONS.map((def) => {
        const row = effective.has(def.key) ? byKey.get(def.key) : undefined;
        return {
          key: def.key,
          group: def.group,
          label: def.label,
          description: def.description,
          kind: def.kind,
          ...(def.unit !== undefined && { unit: def.unit }),
          ...(def.min !== undefined && { min: def.min }),
          ...(def.max !== undefined && { max: def.max }),
          value: effective.get(def.key) ?? defaults[def.key],
          defaultValue: defaults[def.key],
          overridden: effective.has(def.key),
          envKey:
            def.key === 'emailSenderAddress' && env.NOTIFICATION_TRANSPORT === 'ses'
              ? 'SES_FROM_ADDRESS'
              : def.envKey,
          updatedAt: row?.updatedAt.toISOString() ?? null,
          updatedBy: row?.updatedBy.displayName ?? null,
        };
      }),
      environment: {
        releaseVersion: this.config.get('RELEASE_VERSION', { infer: true }) ?? 'development',
        emailTransport: env.NOTIFICATION_TRANSPORT,
      },
    };
  }

  async update(
    actorUserId: string,
    changes: PlatformSettingChangeDto[],
    reason: string,
  ): Promise<PlatformSettingsResponseDto> {
    const env = this.settings.env;
    const keys = changes.map((c) => c.key);
    if (new Set(keys).size !== keys.length) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Each setting may appear only once.',
      });
    }
    if (!reason.trim()) {
      throw new AppHttpException({ code: 'VALIDATION_ERROR', message: 'A reason is required.' });
    }

    // Validate everything before writing anything: one bad value refuses
    // the whole change, and the response names every field at fault.
    const errors: Record<string, string> = {};
    const next = new Map<PlatformSettingKey, SettingValue | null>();
    for (const change of changes) {
      if (change.value === null) {
        next.set(change.key, null);
        continue;
      }
      const checked = validatePlatformSetting(change.key, change.value, env);
      if (checked.ok) next.set(change.key, checked.value);
      else errors[change.key] = checked.message;
    }
    if (Object.keys(errors).length > 0) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Some settings are outside their allowed limits.',
        details: { fields: errors },
      });
    }

    const before = await this.effectiveValues();
    const defaults = platformSettingDefaults(env);
    const applied: { key: PlatformSettingKey; from: SettingValue; to: SettingValue }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const [key, value] of next) {
        const to = value ?? defaults[key];
        if (value === null) {
          await tx.platformSetting.deleteMany({ where: { key } });
        } else {
          await tx.platformSetting.upsert({
            where: { key },
            create: { key, value: value, updatedByUserId: actorUserId },
            update: { value: value, updatedByUserId: actorUserId },
          });
        }
        if (!sameValue(before[key], to)) applied.push({ key, from: before[key], to });
      }
    });
    this.settings.invalidate();

    for (const change of applied) {
      await this.audit.recordPlatform({
        actorUserId,
        actorRole: 'SOFTWARE_ADMIN',
        action: PLATFORM_SETTING_CHANGED_ACTION,
        entityType: 'PlatformSetting',
        reason,
        metadata: {
          key: change.key,
          from: change.from,
          to: change.to,
          resetToDefault: next.get(change.key) === null,
        },
      });
    }
    if (applied.length > 0) await this.announce(actorUserId, applied, reason);
    return this.list();
  }

  /** Sends the settings-in-effect test email to the signed-in admin. */
  async sendTestEmail(actorUserId: string): Promise<{ sentTo: string }> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { email: true, displayName: true },
    });
    if (!user.email) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Your account has no email address to send to.',
      });
    }
    const current = await this.settings.current();
    try {
      await this.notifications.send({
        to: user.email,
        template: PLATFORM_TEST_EMAIL_TEMPLATE_NAME,
        variables: {
          displayName: user.displayName,
          sender: `${current.emailSenderName} <${current.emailSenderAddress}>`,
        },
      });
    } catch (error) {
      this.logger.warn(`Test email failed: ${String(error)}`);
      throw new AppHttpException({
        code: 'SERVICE_UNAVAILABLE',
        message: `The email provider did not accept the message: ${String(
          error instanceof Error ? error.message : error,
        ).slice(0, 200)}`,
      });
    }
    return { sentTo: user.email };
  }

  private async effectiveValues(): Promise<PlatformSettings> {
    const listed = await this.list();
    return Object.fromEntries(
      listed.settings.map((s) => [s.key, s.value]),
    ) as unknown as PlatformSettings;
  }

  /** Best-effort: the change is saved and audited whatever the mail does. */
  private async announce(
    actorUserId: string,
    applied: { key: PlatformSettingKey; from: SettingValue; to: SettingValue }[],
    reason: string,
  ): Promise<void> {
    try {
      const [actor, admins] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: actorUserId },
          select: { displayName: true },
        }),
        prisma.user.findMany({
          where: {
            id: { not: actorUserId },
            status: 'ACTIVE',
            email: { not: null },
            platformRoleAssignments: { some: { role: 'SOFTWARE_ADMIN', status: 'ACTIVE' } },
          },
          select: { email: true, displayName: true },
        }),
      ]);
      const summary = applied
        .map(({ key, from, to }) => {
          const def = platformSettingDefinition(key);
          return `- ${def.label}: ${describeSettingValue(def, from)} → ${describeSettingValue(def, to)}`;
        })
        .join('\n');
      for (const admin of admins) {
        await this.notifications
          .send({
            to: admin.email!,
            template: PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
            variables: {
              displayName: admin.displayName,
              actorName: actor.displayName,
              summary,
              reason,
            },
          })
          .catch((error: unknown) =>
            this.logger.warn(`Settings-change email failed: ${String(error)}`),
          );
      }
    } catch (error) {
      this.logger.warn(`Settings-change announcement failed: ${String(error)}`);
    }
  }
}
