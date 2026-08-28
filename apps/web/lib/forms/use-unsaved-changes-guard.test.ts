import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

describe('useUnsavedChangesGuard', () => {
  it('lets navigation proceed unguarded when nothing is dirty', () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(false));
    const navigate = vi.fn();
    const preventDefault = vi.fn();
    act(() => {
      result.current.guardNavigation(navigate)({ preventDefault } as never);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.confirmOpen).toBe(false);
  });

  it('defers navigation behind a confirmation when dirty, then proceeds on confirm', () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    const navigate = vi.fn();
    const preventDefault = vi.fn();

    act(() => {
      result.current.guardNavigation(navigate)({ preventDefault } as never);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.confirmOpen).toBe(true);

    act(() => result.current.confirmLeave());
    expect(navigate).toHaveBeenCalledOnce();
    expect(result.current.confirmOpen).toBe(false);
  });

  it('cancelLeave discards the pending navigation', () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    const navigate = vi.fn();

    act(() => {
      result.current.guardNavigation(navigate)({ preventDefault: vi.fn() } as never);
    });
    act(() => result.current.cancelLeave());
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.confirmOpen).toBe(false);
  });

  it('registers a beforeunload listener only while dirty', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
      initialProps: { dirty: false },
    });
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.anything());

    rerender({ dirty: true });
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
