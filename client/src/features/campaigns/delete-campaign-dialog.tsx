import { LoaderCircleIcon } from 'lucide-react';
import { useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { commandFailureMessage } from './campaign-messages';
import { settingsFailureOf, useSettingsFetcher } from './use-settings-fetcher';

export type DeleteCampaignDialogProps = Readonly<{
  campaignId: string;
  campaignName: string;
  onClose: () => void;
}>;

/** "Excluir mesa": irreversible, so the button only works once the exact name is typed. The
 *  action closes the table in this tab and goes to `/`; a refusal stays in the dialog. Mounted
 *  only while open, so every opening starts empty.
 *
 *  Example: `{deleting && <DeleteCampaignDialog campaignId={id} campaignName={name} onClose={close} />}` */
export function DeleteCampaignDialog(props: DeleteCampaignDialogProps): React.JSX.Element {
  const fetcher = useSettingsFetcher(props.campaignId);
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const failure = settingsFailureOf(fetcher.settled);
  const confirmed = typed.trim() === props.campaignName;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !fetcher.busy && props.onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{props.campaignName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Apaga os grids, tokens, fichas, desenhos e imagens da mesa para todo mundo. Não tem
            volta.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-[13px] text-label">
            Para confirmar, digite o nome da mesa: <strong>{props.campaignName}</strong>
          </label>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {failure && (
          <p role="alert" className="text-sm text-destructive-text">
            {commandFailureMessage(failure)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel size="lg" disabled={fetcher.busy}>
            Cancelar
          </AlertDialogCancel>
          <Button
            size="lg"
            variant="destructive"
            disabled={!confirmed || fetcher.busy}
            aria-busy={fetcher.busy}
            onClick={() => fetcher.send({ intent: 'delete' })}
          >
            {fetcher.busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
            {fetcher.busy ? 'Excluindo…' : 'Excluir para sempre'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
