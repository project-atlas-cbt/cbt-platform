'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Section } from '../section';

export function OverlaySection() {
  return (
    <Section title="Dialog, Tabs, Toast">
      <div className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">Reject question…</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject this question?</DialogTitle>
              <DialogDescription>
                Doctrine §7: destructive actions are visually distinct and require explicit
                confirmation — this dialog is that confirmation, not the action itself.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Reject</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" onClick={() => toast.success('Question approved.')}>
          Toast: success
        </Button>
        <Button variant="secondary" onClick={() => toast.error('Could not save — try again.')}>
          Toast: error
        </Button>
        <Button variant="secondary" onClick={() => toast.info('Session ends in 5 minutes.')}>
          Toast: info
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">12 questions awaiting review.</TabsContent>
        <TabsContent value="approved">340 approved questions.</TabsContent>
        <TabsContent value="rejected">8 rejected questions.</TabsContent>
      </Tabs>
    </Section>
  );
}
