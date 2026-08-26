'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

/**
 * DoD item 10: logout clears all client state. `useAuth().logout()` is the
 * one place that happens (auth-context.tsx); this button is the one place
 * it's currently reachable from, until F2's real profile menu exists.
 */
export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={() => void handleLogout()} loading={loading}>
      Sign out
    </Button>
  );
}
