import type { ReactNode } from 'react';
import { PlatformAuthProvider } from '@/lib/auth';

/**
 * Wraps both `/admin/login` and `/admin/(shell)/*` with the platform
 * session bootstrap (`GET /platform/auth/me`) — scoped to `/admin/*` only,
 * not the root layout, so a school user's session bootstrap never fires an
 * extra platform `/me` call and vice versa (the two sessions are unrelated
 * mechanisms — see `platform-auth-context.tsx`'s own doc comment).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PlatformAuthProvider>{children}</PlatformAuthProvider>;
}
