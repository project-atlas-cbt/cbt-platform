import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('shows the default tab content and switches on click', async () => {
    render(
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">12 pending</TabsContent>
        <TabsContent value="approved">340 approved</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('12 pending')).toBeVisible();
    expect(screen.queryByText('340 approved')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Approved' }));
    expect(screen.getByText('340 approved')).toBeVisible();
  });
});
