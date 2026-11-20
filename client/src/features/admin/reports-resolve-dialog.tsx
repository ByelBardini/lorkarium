import { USER_REPORT_ADMIN_NOTE_MAX_LENGTH } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export type ReportResolveDialogProps = Readonly<{
  onResolve: (note: string) => void;
  onClose: () => void;
}>;

/** "Resolver a denúncia": the admin's note (optional, only the backoffice reads it) before the
 *  report closes; whoever reported gets the e-mail that it was looked at, without the note.
 *
 *  Example: `<ReportResolveDialog onResolve={(note) => close(report.id, 'resolved', note)} onClose={hide} />` */
export function ReportResolveDialog({
  onResolve,
  onClose,
}: ReportResolveDialogProps): React.JSX.Element {
  const id = useId();
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver a denúncia</DialogTitle>
          <DialogDescription>
            Quem denunciou recebe um e-mail dizendo que a denúncia foi analisada, sem a medida.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onResolve(note);
          }}
        >
          <FormField id={id} label="Nota (opcional, só o backoffice lê)" error={undefined}>
            <Textarea
              id={id}
              value={note}
              maxLength={USER_REPORT_ADMIN_NOTE_MAX_LENGTH}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Resolver</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
