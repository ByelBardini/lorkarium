import { Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CampaignsFailure } from '@/services/campaigns-api';
import { PASSWORD_FAILURES, publicJoinFailureMessage } from './explore-messages';

export type JoinPublicDialogProps = Readonly<{
  campaignName: string;
  submitting: boolean;
  failure: CampaignsFailure | null;
  onSubmit: (password: string) => void;
  onClose: () => void;
}>;

/** The password of a protected public campaign, asked before "Entrar". A wrong one shows under
 *  the field; any other refusal in the alert.
 *
 *  Example: `{asking && <JoinPublicDialog campaignName="Vharn" submitting={busy} failure={failure} onSubmit={join} onClose={close} />}` */
export function JoinPublicDialog(props: JoinPublicDialogProps): React.JSX.Element {
  const id = useId();
  const [password, setPassword] = useState('');
  const [blank, setBlank] = useState(false);
  const failure = props.failure;
  const fieldError = blank
    ? 'Informe a senha da mesa.'
    : failure && PASSWORD_FAILURES.has(failure.kind)
      ? publicJoinFailureMessage(failure)
      : undefined;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setBlank(password === '');
    if (password !== '') props.onSubmit(password);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entrar em “{props.campaignName}”</DialogTitle>
          <DialogDescription>Essa mesa pede senha. Peça ao mestre.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-busy={props.submitting}
          onSubmit={submit}
          className="flex flex-col gap-4"
        >
          {failure && !PASSWORD_FAILURES.has(failure.kind) && (
            <Alert variant="destructive" className="px-3.5 py-3 text-sm">
              {publicJoinFailureMessage(failure)}
            </Alert>
          )}
          <FormField id={id} label="Senha da mesa" error={fieldError}>
            <PasswordField
              id={id}
              autoFocus
              value={password}
              onValueChange={setPassword}
              invalid={fieldError !== undefined}
              describedBy={fieldError ? `${id}-error` : undefined}
            />
          </FormField>
          <DialogButtons submitting={props.submitting} onCancel={props.onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DialogButtonsProps = Readonly<{ submitting: boolean; onCancel: () => void }>;

function DialogButtons({ submitting, onCancel }: DialogButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="lg" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>
    </div>
  );
}
