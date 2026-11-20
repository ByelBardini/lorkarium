import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { screenshotFailureText } from '@/components/screenshot-shots/screenshot-failure-text';
import { ScreenshotShotsField } from '@/components/screenshot-shots/screenshot-shots-field';
import {
  useScreenshotShots,
  type ScreenshotShots,
  type ScreenshotShotsOptions,
} from '@/components/screenshot-shots/use-screenshot-shots';
import type { FeedbackWhere } from '@/lib/feedback-platform';
import type { FeedbackApi } from '@/services/feedback-api';
import {
  emptyFeedbackDraft,
  feedbackRequestOf,
  firstMissingOf,
  type FeedbackDraft,
} from './feedback-draft';
import { FeedbackFields, feedbackFieldId } from './feedback-fields';
import {
  FEEDBACK_PRIVACY_TEXT,
  FEEDBACK_SENT_TEXT,
  FEEDBACK_SHOTS_LIMIT_TEXT,
  feedbackFailureText,
} from './feedback-messages';

export type FeedbackDialogProps = Readonly<{
  api: FeedbackApi;
  /** Where the app detected it runs (`feedbackWhereOf(navigator.userAgent)`); editable. */
  where: FeedbackWhere;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

type SendStage = 'editing' | 'sending' | 'sent';

/** "Relatar um bug ou sugerir": the sections of the repository's issue forms, where it happened,
 *  the version and up to 5 screenshots, to the team's queue. The screenshots go up first; the
 *  person hears back only by e-mail, if it becomes an issue.
 *
 *  Example: `<FeedbackDialog api={deps.feedbackApi} where={where} open onOpenChange={setOpen} />` */
export function FeedbackDialog(props: FeedbackDialogProps): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Relatar um bug ou sugerir</DialogTitle>
          <DialogDescription>{FEEDBACK_PRIVACY_TEXT}</DialogDescription>
        </DialogHeader>
        {props.open && <FeedbackForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm(props: FeedbackDialogProps): React.JSX.Element {
  const idPrefix = useId();
  const [draft, setDraft] = useState<FeedbackDraft>(() => emptyFeedbackDraft(props.where));
  const [missing, setMissing] = useState<string | null>(null);
  const shots = useScreenshotShots(shotsOptionsOf(props.api));
  const { stage, failure, send } = useFeedbackSend(props.api, shots);
  if (stage === 'sent') return <FeedbackSent onClose={() => props.onOpenChange(false)} />;
  const submit = (): void => {
    const blank = firstMissingOf(draft);
    setMissing(blank);
    if (blank !== null) return document.getElementById(feedbackFieldId(idPrefix, blank))?.focus();
    void send(draft);
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FeedbackFields idPrefix={idPrefix} draft={draft} missing={missing} onChange={setDraft} />
      <ScreenshotShotsField shots={shots} disabled={stage === 'sending'} />
      <SendFooter failure={failure} sending={stage === 'sending'} />
    </form>
  );
}

function SendFooter({
  failure,
  sending,
}: Readonly<{ failure: string | null; sending: boolean }>): React.JSX.Element {
  return (
    <>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar relato'}
        </Button>
      </DialogFooter>
    </>
  );
}

function shotsOptionsOf(api: FeedbackApi): ScreenshotShotsOptions {
  return {
    upload: async (file) => {
      const result = await api.uploadAttachment(file);
      if (result.ok) return { ok: true, id: result.value.id };
      return { ok: false, error: screenshotFailureText(result.failure) };
    },
    limitText: FEEDBACK_SHOTS_LIMIT_TEXT,
  };
}

// The screenshots go up first: one that fails keeps the feedback from leaving (its error is on it).
function useFeedbackSend(
  api: FeedbackApi,
  shots: ScreenshotShots,
): Readonly<{
  stage: SendStage;
  failure: string | null;
  send: (draft: FeedbackDraft) => Promise<void>;
}> {
  const [stage, setStage] = useState<SendStage>('editing');
  const [failure, setFailure] = useState<string | null>(null);
  const send = async (draft: FeedbackDraft): Promise<void> => {
    setStage('sending');
    setFailure(null);
    const attachmentIds = await shots.uploadAll();
    if (attachmentIds === null) return setStage('editing');
    const result = await api.send(feedbackRequestOf(draft, attachmentIds));
    setStage(result.ok ? 'sent' : 'editing');
    setFailure(result.ok ? null : feedbackFailureText(result.failure));
  };
  return { stage, failure, send };
}

function FeedbackSent({ onClose }: Readonly<{ onClose: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-foreground">
        {FEEDBACK_SENT_TEXT}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </DialogFooter>
    </div>
  );
}
