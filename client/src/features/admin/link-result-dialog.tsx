import { Loader2Icon } from 'lucide-react';
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
import type { Clipboard } from '@/services/clipboard';
import { adminFailureMessage } from './admin-messages';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import { ShareLinkPanel } from './share-link-panel';
import type { UsersIntent } from './users-action';
import { usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type LinkResultDialogProps = Readonly<{
  title: string;
  description: string;
  /** The command that issues the link, sent once when the dialog opens. */
  intent: Extract<UsersIntent, { intent: 'password-reset' | 'invitation-resend' }>;
  fieldLabel: string;
  note: string;
  clipboard: Clipboard;
  onClose: () => void;
}>;

/** Issues a one-time link as it opens (new password, resent invitation) and shows it to copy.
 *
 *  Example: `<LinkResultDialog title="Link de nova senha" intent={{ intent: 'password-reset', userId }} … />` */
export function LinkResultDialog(props: LinkResultDialogProps): React.JSX.Element {
  const fetcher = useUsersFetcher();
  useOnceOnMount(() => fetcher.send(props.intent));
  const settled = fetcher.settled;
  const link = settled && 'link' in settled ? settled.link : null;
  const failure = usersFailureOf(settled);
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent aria-busy={fetcher.busy}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {link && (
          <ShareLinkPanel
            link={link}
            fieldLabel={props.fieldLabel}
            note={props.note}
            clipboard={props.clipboard}
          />
        )}
        {!link && !failure && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
            Gerando o link…
          </p>
        )}
        {failure && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {adminFailureMessage(failure)}
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={props.onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
