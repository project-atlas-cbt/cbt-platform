import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditActionRegistry } from './audit-action.registry.js';

describe('AuditActionRegistry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('has() reflects register()/registerAll()', () => {
    const registry = new AuditActionRegistry();
    expect(registry.has('FOO')).toBe(false);
    registry.register('FOO');
    expect(registry.has('FOO')).toBe(true);
    registry.registerAll(['BAR', 'BAZ']);
    expect(registry.has('BAR')).toBe(true);
    expect(registry.has('BAZ')).toBe(true);
  });

  it('warnIfUnknown warns once per distinct unknown action, not once per call', () => {
    const registry = new AuditActionRegistry();
    registry.warnIfUnknown('UNREGISTERED_ACTION');
    registry.warnIfUnknown('UNREGISTERED_ACTION');
    registry.warnIfUnknown('UNREGISTERED_ACTION');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warnIfUnknown never warns for a registered action', () => {
    const registry = new AuditActionRegistry();
    registry.register('KNOWN_ACTION');
    registry.warnIfUnknown('KNOWN_ACTION');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warnIfUnknown never warns for the generated BREAK_GLASS_* family', () => {
    const registry = new AuditActionRegistry();
    registry.warnIfUnknown('BREAK_GLASS_ACCOUNT_DEACTIVATE');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('allKnown() returns every registered action', () => {
    const registry = new AuditActionRegistry();
    registry.registerAll(['A', 'B']);
    expect([...registry.allKnown()].sort()).toEqual(['A', 'B']);
  });
});
