import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateSchoolPage from './page';

const mutateAsync = vi.fn();
vi.mock('@/lib/platform/mutations', () => ({
  useCreateSchool: () => ({ mutateAsync }),
}));

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/school name/i), 'Greenfield College');
  await userEvent.type(screen.getByLabelText(/admin first name/i), 'Ada');
  await userEvent.type(screen.getByLabelText(/admin last name/i), 'Lovelace');
  await userEvent.type(screen.getByLabelText(/admin email/i), 'ada@example.com');
  await userEvent.type(screen.getByLabelText(/admin login identifier/i), 'ada.admin');
  await userEvent.type(screen.getByLabelText(/subscription plan/i), 'STANDARD');
}

describe('CreateSchoolPage', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it('shows validation errors for empty required fields and never calls the mutation', async () => {
    render(<CreateSchoolPage />);
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    expect(
      await screen.findByText(/enter a school name/i, {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('rejects a malformed admin email', async () => {
    render(<CreateSchoolPage />);
    await fillValidForm();
    await userEvent.clear(screen.getByLabelText(/admin email/i));
    await userEvent.type(screen.getByLabelText(/admin email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    expect(
      await screen.findByText(/enter a valid email address/i, {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('submits real field values, parsing initialPeriodDays to a number', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 's1', subdomain: 'greenfield' });
    render(<CreateSchoolPage />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    await screen.findByText(/school created/i, {}, { timeout: 10000 });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Greenfield College',
        adminEmail: 'ada@example.com',
        initialPeriodDays: 365,
        startingStructure: 'STANDARD',
      }),
    );
  });

  it('can start the school empty instead of with the standard setup (ADR-0038)', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 's1', subdomain: 'greenfield' });
    render(<CreateSchoolPage />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('radio', { name: /start empty/i }));
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    await screen.findByText(/school created/i, {}, { timeout: 10000 });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ startingStructure: 'EMPTY' }),
    );
  });

  it('on success, names the generated subdomain and never shows a raw activation key', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 's1', subdomain: 'greenfield' });
    render(<CreateSchoolPage />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    expect(await screen.findByText(/greenfield/, {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view school/i })).toHaveAttribute(
      'href',
      '/admin/schools/s1',
    );
    // No field on the page could plausibly be a raw key — the only strings
    // shown are the confirmation copy and the subdomain/link.
    expect(screen.queryByText(/key/i)).not.toBeInTheDocument();
  });

  it('shows a submit error and stays on the form when the mutation rejects', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('boom'));
    render(<CreateSchoolPage />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /create school/i }));
    expect(await screen.findByRole('alert', {}, { timeout: 10000 })).toHaveTextContent(
      /could not create the school/i,
    );
    expect(screen.queryByText(/school created/i)).not.toBeInTheDocument();
  });
});
