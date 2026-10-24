import { createInvitationRequestDto, type UserRoleDto } from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { adminFailureMessage } from './admin-messages';

const EMPTY_EMAIL = 'Informe o e-mail da pessoa.';
const INVALID_EMAIL = 'Informe um e-mail válido, como voce@exemplo.com.';

export type InviteFormProps = Readonly<{
  busy: boolean;
  failure: UserAdminFailure | null;
  /** Who already has the address in the list ("@pedro (suspenso)"), checked before any request. */
  ownerOf: (email: string) => string | null;
  onInvite: (input: Readonly<{ email: string; role: UserRoleDto }>) => void;
  /** "Reenviar convite" offered on `already_invited`. */
  onResend: (invitationId: string) => void;
}>;

/** E-mail and role of the invitation, validated by the contracts DTO before sending.
 *
 *  Example: `<InviteForm busy={false} failure={null} ownerOf={…} onInvite={…} onResend={…} />` */
export function InviteForm(props: InviteFormProps): React.JSX.Element {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRoleDto>('user');
  const [error, setError] = useState<string | undefined>();
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const problem = emailProblem(email, props.ownerOf);
    setError(problem);
    if (problem) {
      document.getElementById(emailId)?.focus();
      return;
    }
    props.onInvite({ email: email.trim().toLowerCase(), role });
  };
  return (
    <form noValidate onSubmit={submit} aria-busy={props.busy} className="flex flex-col gap-5">
      <FormField id={emailId} label="E-mail" error={error}>
        <Input
          id={emailId}
          type="email"
          autoFocus
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${emailId}-error` : undefined}
        />
      </FormField>
      <RoleField value={role} onChange={setRole} />
      {props.failure && <InviteRefusal failure={props.failure} onResend={props.onResend} />}
      <Button type="submit" size="xl" disabled={props.busy}>
        {props.busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {props.busy ? 'Convidando…' : 'Convidar'}
      </Button>
    </form>
  );
}

function emailProblem(
  email: string,
  ownerOf: (email: string) => string | null,
): string | undefined {
  if (email.trim() === '') return EMPTY_EMAIL;
  const parsed = createInvitationRequestDto.shape.email.safeParse(email);
  if (!parsed.success) return INVALID_EMAIL;
  const owner = ownerOf(parsed.data);
  return owner ? `Esse e-mail já é de ${owner}.` : undefined;
}

function RoleField({
  value,
  onChange,
}: Readonly<{ value: UserRoleDto; onChange: (role: UserRoleDto) => void }>): React.JSX.Element {
  const ids = { user: useId(), admin: useId() };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-label">Papel</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next === 'admin' ? 'admin' : 'user')}
      >
        {(['user', 'admin'] as const).map((role) => (
          <div key={role} className="flex items-center gap-3">
            <RadioGroupItem id={ids[role]} value={role} />
            <Label htmlFor={ids[role]} className="cursor-pointer text-sm text-foreground">
              {role === 'admin' ? 'Admin' : 'Usuário'}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function InviteRefusal({
  failure,
  onResend,
}: Readonly<{
  failure: UserAdminFailure;
  onResend: (invitationId: string) => void;
}>): React.JSX.Element {
  const pending = failure.kind === 'already_invited' ? failure.invitationId : null;
  return (
    <Alert variant="destructive" className="flex flex-col items-start gap-2 px-3.5 py-3 text-sm">
      {adminFailureMessage(failure)}
      {pending && (
        <Button type="button" variant="outline" size="sm" onClick={() => onResend(pending)}>
          Reenviar convite
        </Button>
      )}
    </Alert>
  );
}
