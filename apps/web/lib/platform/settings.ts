'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiComponents } from '@atlas/contracts';
import { apiClient, unwrap } from '@/lib/api';

/** ADR-0036 — System Configuration: the editable platform settings. */

export type PlatformSetting = ApiComponents['schemas']['PlatformSettingDto'];
export type PlatformSettingKey = PlatformSetting['key'];
export type PlatformSettingChange = ApiComponents['schemas']['PlatformSettingChangeDto'];

export const PLATFORM_SETTINGS_QUERY_KEY = ['platform', 'settings'] as const;

export function usePlatformSettings() {
  return useQuery({
    queryKey: PLATFORM_SETTINGS_QUERY_KEY,
    queryFn: () => unwrap(apiClient.GET('/platform/settings', {})),
  });
}

/** Never optimistic: the screen shows what the server saved. */
export function useUpdatePlatformSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { changes: PlatformSettingChange[]; reason: string }) =>
      unwrap(apiClient.PATCH('/platform/settings', { body })),
    onSuccess: (data) => client.setQueryData(PLATFORM_SETTINGS_QUERY_KEY, data),
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/platform/settings/test-email', {})),
  });
}

const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400 } as const;

/** Seconds → the setting's display unit (a duration's input shows this). */
export function toUnit(setting: PlatformSetting, seconds: number): number {
  return setting.unit ? Math.round((seconds / UNIT_SECONDS[setting.unit]) * 100) / 100 : seconds;
}

export function fromUnit(setting: PlatformSetting, amount: number): number {
  return setting.unit ? Math.round(amount * UNIT_SECONDS[setting.unit]) : amount;
}

/** A value as people read it: `30 minutes`, `ops@x.com, b@y.com`. */
export function describeValue(setting: PlatformSetting, value: PlatformSetting['value']): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Nobody';
  if (setting.unit && typeof value === 'number') {
    const n = toUnit(setting, value);
    return `${n} ${n === 1 ? setting.unit.slice(0, -1) : setting.unit}`;
  }
  return value === '' ? 'Not set' : String(value);
}

/** The text a field starts from. */
export function toDraft(setting: PlatformSetting, value: PlatformSetting['value']): string {
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'number') return String(toUnit(setting, value));
  return value;
}

/** Parses a field's text into the value the API expects, or an error. */
export function parseDraft(
  setting: PlatformSetting,
  draft: string,
): { ok: true; value: PlatformSetting['value'] } | { ok: false; message: string } {
  switch (setting.kind) {
    case 'emailList':
      return {
        ok: true,
        value: draft
          .split(/[\n,]/u)
          .map((s) => s.trim())
          .filter(Boolean),
      };
    case 'duration':
    case 'count': {
      const amount = Number(draft);
      if (draft.trim() === '' || !Number.isFinite(amount)) {
        return { ok: false, message: 'Enter a number.' };
      }
      const value = fromUnit(setting, amount);
      if (!Number.isInteger(value)) return { ok: false, message: 'Enter a whole number.' };
      if (
        (setting.min !== undefined && value < setting.min) ||
        (setting.max !== undefined && value > setting.max)
      ) {
        return { ok: false, message: limitsText(setting) };
      }
      return { ok: true, value };
    }
    default:
      return draft.trim()
        ? { ok: true, value: draft.trim() }
        : { ok: false, message: 'This cannot be empty.' };
  }
}

/** "Between 5 and 120 minutes." */
export function limitsText(setting: PlatformSetting): string {
  if (setting.min === undefined || setting.max === undefined) return '';
  if (setting.kind === 'emailList') return `Up to ${setting.max} addresses.`;
  if (setting.kind === 'text') return `Up to ${setting.max} characters.`;
  const unit = setting.unit ?? '';
  return `Between ${toUnit(setting, setting.min)} and ${toUnit(setting, setting.max)}${unit ? ` ${unit}` : ''}.`;
}
