'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Section } from '../section';

export function SelectionSection() {
  const [checked, setChecked] = useState(false);

  return (
    <Section title="Select, Checkbox, Radio">
      <div className="flex flex-wrap items-end gap-8">
        <div className="w-48 space-y-1.5">
          <Label htmlFor="workbench-select">Academic term</Label>
          <Select defaultValue="term-1">
            <SelectTrigger id="workbench-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="term-1">First Term</SelectItem>
              <SelectItem value="term-2">Second Term</SelectItem>
              <SelectItem value="term-3">Third Term</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="workbench-checkbox"
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
          />
          <Label htmlFor="workbench-checkbox">Notify me</Label>
        </div>

        <RadioGroup defaultValue="objective" className="grid">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="objective" id="workbench-radio-1" />
            <Label htmlFor="workbench-radio-1">Objective</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="theory" id="workbench-radio-2" />
            <Label htmlFor="workbench-radio-2">Theory</Label>
          </div>
        </RadioGroup>
      </div>
    </Section>
  );
}
