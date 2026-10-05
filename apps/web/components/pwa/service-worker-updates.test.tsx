import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ACTIVATE_UPDATE_MESSAGE } from '@/lib/pwa/update-policy';

let pathname = '/student/assessment';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { ServiceWorkerUpdates } = await import('./service-worker-updates');

describe('ServiceWorkerUpdates (F21 DoD 5)', () => {
  const postMessage = vi.fn();
  beforeEach(() => {
    postMessage.mockReset();
    const registration = {
      waiting: { postMessage },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: () => Promise.resolve(registration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });
  afterEach(() => {
    // jsdom has no service worker; remove the stub so other suites see none.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('asks a waiting worker to take over on a page that is not an exam', async () => {
    pathname = '/student/exam/a1/submitted';
    render(<ServiceWorkerUpdates />);
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: ACTIVATE_UPDATE_MESSAGE }),
    );
  });

  it('leaves the waiting worker alone during an exam and keeps a heartbeat mark', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { open: () => Promise.resolve({ put, delete: del }) });
    pathname = '/student/exam/a1';
    const view = render(<ServiceWorkerUpdates />);
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(String(put.mock.calls[0]![0])).toMatch(/^\/__atlas\/open-attempt\//);
    expect(postMessage).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(del).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
