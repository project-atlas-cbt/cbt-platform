'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, Info, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/nav';
import { ApiError } from '@/lib/api';
import { useQuestion } from '@/lib/questions/queries';
import { useArchiveQuestion, useCreateRevision } from '@/lib/questions/mutations';
import { sanitizeQuestionHtml } from '@/lib/questions/sanitize-html';
import { pickCurrentRevision } from '@/lib/questions/revision-order';
import { QuestionStatusBadge } from './question-status-badge';
import { MediaPreview } from './media-preview';
import { RevisionHistory } from './revision-history';

/**
 * F9 — read-only current-revision view + `RevisionHistory`, with
 * status-based actions: Edit (DRAFT), Start new revision (APPROVED/
 * REJECTED — DoD item 10's usability requirement: the confirmation
 * explains a new revision is created *before* the mutation fires), and
 * Archive.
 */
export function QuestionDetailScreen({ questionId }: { questionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get('notice');

  const question = useQuestion(questionId);
  const canManageOwn = useHasPermission('questionBank.editOwnDraft');
  const canArchive = useHasPermission('questionBank.archive');

  const createRevision = useCreateRevision(questionId);
  const archiveQuestion = useArchiveQuestion();
  const [confirmNewRevision, setConfirmNewRevision] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (question.isPending) return <Skeleton className="h-96 w-full" />;
  if (question.isError) {
    return <ErrorState error={question.error} onRetry={() => void question.refetch()} />;
  }

  const data = question.data;
  const current = pickCurrentRevision(data.revisions);
  const isArchived = data.archivedAt !== null;

  async function handleStartNewRevision() {
    setActionError(null);
    try {
      await createRevision.mutateAsync();
      setConfirmNewRevision(false);
      router.push(`/teacher/question-bank/${questionId}/edit`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not start a new revision.');
    }
  }

  async function handleArchive() {
    setActionError(null);
    try {
      await archiveQuestion.mutateAsync(questionId);
      setConfirmArchive(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not archive this question.');
    }
  }

  return (
    <div className="space-y-6">
      {notice === 'locked' ? (
        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-subtle px-3 py-2 text-sm text-info-subtle-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>This question changed since you last opened it — showing the current version.</p>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{data.subjectName}</h1>
          <p className="text-sm text-text-secondary">
            {data.level} · {current?.difficulty} · {current?.marks} mark
            {current?.marks === 1 ? '' : 's'}
            {data.topicName ? ` · ${data.topicName}` : ''}
          </p>
          <p className="mt-1 text-sm text-text-muted">By {data.authorName}</p>
        </div>
        <div className="flex items-center gap-2">
          {isArchived ? (
            <QuestionStatusBadge value="ARCHIVED" />
          ) : (
            <QuestionStatusBadge value={data.currentStatus} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isArchived && current?.status === 'DRAFT' && canManageOwn ? (
          <Button asChild>
            <Link href={`/teacher/question-bank/${questionId}/edit`}>
              <Pencil aria-hidden /> Edit draft
            </Link>
          </Button>
        ) : null}
        {!isArchived &&
        (current?.status === 'APPROVED' || current?.status === 'REJECTED') &&
        canManageOwn ? (
          <Button onClick={() => setConfirmNewRevision(true)}>
            <Pencil aria-hidden /> Start new revision
          </Button>
        ) : null}
        {!isArchived && canArchive ? (
          <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
            <Archive aria-hidden /> Archive
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {actionError}
        </p>
      ) : null}

      {current ? (
        <div className="space-y-4 rounded-md border border-border p-4">
          <div
            className="text-sm text-text-primary [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(current.content) }}
          />
          <ul className="space-y-1 text-sm">
            {current.options.map((option) => (
              <li key={option.id} className="flex items-center gap-2">
                <span
                  className={
                    option.correctFlag ? 'font-semibold text-success' : 'text-text-secondary'
                  }
                >
                  {option.correctFlag ? '✓' : '—'}
                </span>
                {option.content}
              </li>
            ))}
          </ul>
          {current.media.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3">
              {current.media.map((item) => (
                <li key={item.id}>
                  <MediaPreview
                    mediaAssetId={item.mediaAssetId}
                    alt={
                      item.mediaType === 'QUESTION_DIAGRAM' ? 'Attached diagram' : 'Attached image'
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {current.explanation ? (
            <div>
              <p className="text-xs font-medium uppercase text-text-muted">Explanation</p>
              <p className="text-sm text-text-secondary">{current.explanation}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <RevisionHistory currentRevisionId={current?.id} revisions={data.revisions} />

      <Dialog open={confirmNewRevision} onOpenChange={setConfirmNewRevision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new revision?</DialogTitle>
            <DialogDescription>
              Editing this creates a new draft revision — the {current?.status.toLowerCase()}{' '}
              version stays unchanged until the new one is resubmitted and re-approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmNewRevision(false)}>
              Cancel
            </Button>
            <Button
              loading={createRevision.isPending}
              onClick={() => void handleStartNewRevision()}
            >
              Start new revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this question?</DialogTitle>
            <DialogDescription>
              Archiving removes it from the active bank and blocks it from being added to a new
              exam. It stays soft/reversible — no history is deleted — but won&rsquo;t be reachable
              from the normal status tabs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={archiveQuestion.isPending}
              onClick={() => void handleArchive()}
            >
              Archive question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
