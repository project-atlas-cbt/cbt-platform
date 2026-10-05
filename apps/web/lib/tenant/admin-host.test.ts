import { describe, expect, it } from 'vitest';
import { adminHostRedirect } from './admin-host';

describe('adminHostRedirect', () => {
  it('sends the admin host root and /login to the Software Admin console', () => {
    expect(adminHostRedirect('admin.examkeep.com', '/')).toBe('/admin');
    expect(adminHostRedirect('ADMIN.examkeep.com', '/login')).toBe('/admin/login');
  });

  it('leaves every other admin host path alone', () => {
    expect(adminHostRedirect('admin.examkeep.com', '/admin')).toBeNull();
    expect(adminHostRedirect('admin.examkeep.com', '/admin/login')).toBeNull();
    expect(adminHostRedirect('admin.examkeep.com', '/unsupported-browser')).toBeNull();
  });

  it('never redirects a school host', () => {
    expect(adminHostRedirect('oakridge.examkeep.com', '/')).toBeNull();
    expect(adminHostRedirect('oakridge.examkeep.com', '/login')).toBeNull();
    expect(adminHostRedirect('administrators.examkeep.com', '/login')).toBeNull();
  });
});
