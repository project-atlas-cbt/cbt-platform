'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F14 gap-closure — the first "my own account" query outside
 * `auth-context.tsx`. `GET /students/me` (`users.student.viewOwnProfile`)
 * resolves the caller's own name/student ID/class/department server-side —
 * no id is ever passed from here.
 */
export function useOwnStudentProfile() {
  return useQuery({
    queryKey: ['students', 'me'],
    queryFn: () => unwrap(apiClient.GET('/students/me', {})),
  });
}
