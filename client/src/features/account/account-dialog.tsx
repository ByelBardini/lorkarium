import { Loader2Icon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { accountFailureMessage, type AccountFailure } from './account-messages';

export type AccountDialogProps = Readonly<{
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}>;

/** The frame of every account dialog: always open while mounted, so each opening starts clean;
 *  Esc, the X and "Cancelar" all go through `onClose`.
 *
 *  Example: `{dialog === 'password' && <AccountDialog title="Trocar senha" description="…" onClose={close}>…</AccountDialog>}` */
export function AccountDialog({
  title,
  description,
  onClose,
  children,
}: AccountDialogProps): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** A refusal no field owns, as the alert at the top of a dialog form. */
export function DialogFailure({ failure }: Readonly<{ failure: AccountFailure | null }>) {
  if (!failure) return null;
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {accountFailureMessage(failure)}
    </Alert>
  );
}

export type DialogButtonsProps = Readonly<{
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onCancel: () => void;
}>;

/** "Cancelar" and the submit, which says what it is doing while the command goes. */
export function DialogButtons({
  busy,
  submitLabel,
  busyLabel,
  onCancel,
}: DialogButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="lg" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? busyLabel : submitLabel}
      </Button>
    </div>
  );
}
