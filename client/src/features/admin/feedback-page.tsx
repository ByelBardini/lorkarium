import type {
  FeedbackEntryDto,
  FeedbackPageDto,
  PublishFeedbackResponseDto,
} from '@lorkarium/contracts';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Alert } from '@/components/ui/alert';
import type { FeedbackActionResult, FeedbackIntent } from './feedback-action';
import { feedbackAdminFailureText, publishedNotice } from './feedback-admin-text';
import { FeedbackDetailDialog } from './feedback-detail-dialog';
import { FeedbackPublishDialog } from './feedback-publish-dialog';
import { FeedbackTable } from './feedback-table';
import { ConfirmDialogFrame } from './confirm-dialog-frame';

export type FeedbackPageProps = Readonly<{ page: FeedbackPageDto }>;

type FeedbackDialogOpen = Readonly<{
  kind: 'detail' | 'publish' | 'archive';
  entry: FeedbackEntryDto;
}>;

/** "Relatos": the bug reports and suggestions waiting, oldest first. Opening one shows its
 *  screenshots; publishing edits the server's draft and opens the issue on GitHub; archiving
 *  deletes it. Either way the reload takes it out of the queue.
 *
 *  Example: `<FeedbackPage page={page} />` */
export function FeedbackPage({ page }: FeedbackPageProps): React.JSX.Element {
  const commands = useFeedbackCommands();
  const [open, setOpen] = useState<FeedbackDialogOpen | null>(null);
  const shown = shownDialogOf(open, commands);
  const failure = failureOf(commands);
  const { busy, outcome } = commands;
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Relatos</title>
      <FeedbackHeader total={page.total} />
      {failure && shown === null && (
        <Alert variant="destructive" className="max-w-xl px-3.5 py-3 text-sm">
          {failure}
        </Alert>
      )}
      {outcome && 'published' in outcome && <PublishedNotice published={outcome.published} />}
      {page.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum relato esperando análise.</p>
      ) : (
        <FeedbackTable
          entries={page.entries}
          busy={busy}
          onOpen={(entry) => setOpen({ kind: 'detail', entry })}
          onPublish={(entry) => setOpen({ kind: 'publish', entry })}
          onArchive={(entry) => setOpen({ kind: 'archive', entry })}
        />
      )}
      {shown && (
        <OpenFeedbackDialog
          open={shown}
          busy={busy}
          failure={shown.entry.id === commands.submittedId ? failure : null}
          onSubmit={commands.submit}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

type FeedbackCommands = Readonly<{
  busy: boolean;
  /** What the last command answered, once it settled; `undefined` while it runs or before any. */
  outcome: FeedbackActionResult | undefined;
  submittedId: string | null;
  submit: (intent: FeedbackIntent) => void;
}>;

function useFeedbackCommands(): FeedbackCommands {
  const fetcher = useFetcher<FeedbackActionResult>();
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const busy = fetcher.state !== 'idle';
  const submit = (intent: FeedbackIntent): void => {
    setSubmittedId(intent.entryId);
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return { busy, outcome: busy ? undefined : fetcher.data, submittedId, submit };
}

// A publish or an archive that went through closes its own dialog: the entry left the queue.
function shownDialogOf(
  open: FeedbackDialogOpen | null,
  { outcome, submittedId }: FeedbackCommands,
): FeedbackDialogOpen | null {
  if (open === null || open.kind === 'detail' || open.entry.id !== submittedId) return open;
  return outcome !== undefined && !('failure' in outcome) ? null : open;
}

function failureOf({ outcome }: FeedbackCommands): string | null {
  return outcome && 'failure' in outcome ? feedbackAdminFailureText(outcome.failure) : null;
}

function FeedbackHeader({ total }: Readonly<{ total: number }>): React.JSX.Element {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-[42px] leading-[1.05] font-medium">Relatos</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        {total} esperando análise, do mais antigo para o mais novo. Publicar abre a issue no GitHub
        com o texto que você revisar e avisa quem enviou; arquivar apaga sem avisar.
      </p>
    </header>
  );
}

function PublishedNotice({
  published,
}: Readonly<{ published: PublishFeedbackResponseDto }>): React.JSX.Element {
  return (
    <p role="status" className="text-sm text-foreground">
      {publishedNotice(published.issueNumber)}{' '}
      <a href={published.issueUrl} target="_blank" rel="noopener noreferrer" className="underline">
        Ver no GitHub
      </a>
    </p>
  );
}

type OpenFeedbackDialogProps = Readonly<{
  open: FeedbackDialogOpen;
  busy: boolean;
  failure: string | null;
  onSubmit: (intent: FeedbackIntent) => void;
  onClose: () => void;
}>;

function OpenFeedbackDialog({
  open,
  busy,
  failure,
  onSubmit,
  onClose,
}: OpenFeedbackDialogProps): React.JSX.Element {
  const { entry } = open;
  if (open.kind === 'detail') return <FeedbackDetailDialog entry={entry} onClose={onClose} />;
  if (open.kind === 'publish') {
    return (
      <FeedbackPublishDialog
        entry={entry}
        busy={busy}
        failureMessage={failure}
        onPublish={(title, body) => onSubmit({ intent: 'publish', entryId: entry.id, title, body })}
        onClose={onClose}
      />
    );
  }
  return (
    <ConfirmDialogFrame
      title={`Arquivar o relato de @${entry.sender.username}?`}
      consequence="O relato e os prints somem para sempre e ninguém é avisado."
      confirmLabel="Arquivar"
      busyLabel="Arquivando…"
      danger
      busy={busy}
      failureMessage={failure}
      onConfirm={() => onSubmit({ intent: 'archive', entryId: entry.id })}
      onClose={onClose}
    />
  );
}
