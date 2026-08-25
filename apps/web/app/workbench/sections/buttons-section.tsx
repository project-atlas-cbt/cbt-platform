'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '../section';

export function ButtonsSection() {
  const [loading, setLoading] = useState(false);

  return (
    <Section title="Buttons">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled>Disabled</Button>
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }}
        >
          {loading ? 'Loading…' : 'Click to load'}
        </Button>
      </div>
    </Section>
  );
}
