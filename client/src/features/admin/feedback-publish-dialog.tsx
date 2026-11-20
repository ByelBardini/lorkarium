import {
  FEEDBACK_ISSUE_BODY_MAX_LENGTH,
  FEEDBACK_ISSUE_TITLE_MAX_LENGTH,
  type FeedbackEntryDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type FeedbackPublishDialogProps = Readonly<{
  entry: FeedbackEntryDto;
  busy: boolean;
  /** The refusal of the last try, shown without closing; `null` for none. */
  failureMessage: string | null;
  onPublish: (title: string, body: string) => void;
  onClose: () => void;
}>;

/** "Publicar no GitHub": the server's draft of the issue, editable, under a warning that it goes
 *  to a public repository. It stays open while it runs and shows the refusal of a failed try.
 *
 *  Example: `<FeedbackPublishDialog entry={entry} busy={false} failureMessage={null} onPublish={…} onClose={…} />` */
export function FeedbackPublishDialog(props: FeedbackPublishDialogProps): React.JSX.Element {
  const ids = useId();
  const [title, setTitle] = useState(props.entry.draft.title);
  const [body, setBody] = useState(props.entry.draft.body);
  const ready = title.trim() !== '' && body.trim() !== '';
  return (
    <Dialog open onOpenChange={(open) => !open && !props.busy && props.onClose()}>
      <DialogContent aria-busy={props.busy} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Publicar no GitHub</DialogTitle>
          <DialogDescription>
            Isto vai para um repositório público. Tire nome, @, e-mail, mesa e qualquer outro dado
            pessoal antes de publicar; os prints não vão.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-title`}>Título da issue</Label>
          <Input
            id={`${ids}-title`}
            value={title}
            maxLength={FEEDBACK_ISSUE_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-body`}>Texto da issue (Markdown)</Label>
          <Textarea
            id={`${ids}-body`}
            value={body}
            rows={14}
            maxLength={FEEDBACK_ISSUE_BODY_MAX_LENGTH}
            className="font-mono text-xs"
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        {props.failureMessage && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {props.failureMessage}
          </Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={!ready || props.busy}
            onClick={() => props.onPublish(title, body)}
          >
            {props.busy ? 'Publicando…' : 'Publicar no GitHub'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
