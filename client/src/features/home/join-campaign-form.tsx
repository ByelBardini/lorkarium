import { joinCampaignRequestDto, type JoinCampaignRequestDto } from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { failureMessage } from '@/features/campaigns/campaign-messages';
import { maskCampaignCode } from '@/lib/campaign-code';
import type { CampaignsFailure } from '@/services/campaigns-api';

type JoinErrors = Partial<Record<'code' | 'password', string>>;

const PASSWORD_FAILURES: ReadonlySet<CampaignsFailure['kind']> = new Set([
  'password_required',
  'password_invalid',
]);

export type JoinCampaignFormProps = Readonly<{
  submitting: boolean;
  failure: CampaignsFailure | null;
  onSubmit: (input: JoinCampaignRequestDto) => void;
  onCancel: () => void;
}>;

/** Code (and password, once asked for) validated by the contracts DTO before sending.
 *
 *  Example: `<JoinCampaignForm submitting={busy} failure={failure} onSubmit={send} onCancel={close} />` */
export function JoinCampaignForm(props: JoinCampaignFormProps): React.JSX.Element {
  const form = useJoinCampaignForm(props.failure, props.onSubmit);
  const ids = { code: useId(), password: useId() };
  const errors = { ...serverErrors(props.failure), ...form.errors };
  return (
    <form
      noValidate
      aria-label="Entrar numa mesa"
      aria-busy={props.submitting}
      onSubmit={form.submit}
      className="flex flex-col gap-4"
    >
      <JoinFailure failure={props.failure} />
      <FormField id={ids.code} label="Código da mesa" error={errors.code}>
        <Input
          id={ids.code}
          value={form.code}
          onChange={(event) => form.setCode(maskCampaignCode(event.target.value))}
          placeholder="VHRN-7K2Q"
          autoComplete="off"
          inputMode="text"
          // Not a credential: keeps password managers from decorating the field.
          data-1p-ignore
          data-lpignore="true"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={errors.code !== undefined}
          aria-describedby={errors.code ? `${ids.code}-error` : undefined}
          className="font-brand tracking-[0.2em] uppercase"
        />
      </FormField>
      {form.passwordAsked && (
        <FormField id={ids.password} label="Senha da mesa" error={errors.password}>
          <PasswordField
            key={form.passwordAttempt}
            id={ids.password}
            autoFocus
            value={form.password}
            onValueChange={form.setPassword}
            invalid={errors.password !== undefined}
            describedBy={errors.password ? `${ids.password}-error` : undefined}
          />
        </FormField>
      )}
      <JoinButtons submitting={props.submitting} onCancel={props.onCancel} />
    </form>
  );
}

function useJoinCampaignForm(
  failure: CampaignsFailure | null,
  onSubmit: (input: JoinCampaignRequestDto) => void,
) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<JoinErrors>({});
  const [passwordAsked, setPasswordAsked] = useState(false);
  const [passwordAttempt, setPasswordAttempt] = useState(0);
  const [seenFailure, setSeenFailure] = useState(failure);
  // A new refusal about the password reveals the field again, empty and focused (it remounts).
  if (failure !== seenFailure) {
    setSeenFailure(failure);
    if (failure && PASSWORD_FAILURES.has(failure.kind)) {
      setPasswordAsked(true);
      setPassword('');
      setPasswordAttempt((attempt) => attempt + 1);
    }
  }
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const checked = validateJoin(code, passwordAsked ? password : undefined);
    setErrors(checked.errors);
    if (checked.input) onSubmit(checked.input);
  };
  return { code, setCode, password, setPassword, errors, passwordAsked, passwordAttempt, submit };
}

function validateJoin(
  code: string,
  password: string | undefined,
): { input: JoinCampaignRequestDto | null; errors: JoinErrors } {
  if (password === '') return { input: null, errors: { password: 'Informe a senha da mesa.' } };
  const parsed = joinCampaignRequestDto.safeParse({ code, password });
  if (parsed.success) return { input: parsed.data, errors: {} };
  const blank = code.replace(/[\s-]/g, '') === '';
  return {
    input: null,
    errors: {
      code: blank
        ? 'Informe o código da mesa.'
        : 'O código tem 8 letras e números, como VHRN-7K2Q.',
    },
  };
}

// Refusals a field owns are shown under it; the rest go to the alert.
function serverErrors(failure: CampaignsFailure | null): JoinErrors {
  if (failure?.kind === 'not_found') return { code: 'Nenhuma mesa com esse código.' };
  if (failure?.kind === 'password_required') return { password: 'Essa mesa pede senha.' };
  if (failure?.kind === 'password_invalid') return { password: 'Senha incorreta.' };
  return {};
}

function JoinFailure({ failure }: Readonly<{ failure: CampaignsFailure | null }>) {
  if (!failure || failure.kind === 'not_found' || PASSWORD_FAILURES.has(failure.kind)) return null;
  const message =
    failure.kind === 'rate_limited'
      ? `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`
      : failureMessage(failure.kind);
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {message}
    </Alert>
  );
}

type JoinButtonsProps = Readonly<{ submitting: boolean; onCancel: () => void }>;

function JoinButtons({ submitting, onCancel }: JoinButtonsProps): React.JSX.Element {
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
