import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SignUpFailure } from '@/services/sign-up-api';
import type { SignUpActionResult, SignUpIntent } from './sign-up-action';
import { SIGN_UP_CLOSED, signUpFailureMessage } from './sign-up-messages';
import { useHumanCheck } from './use-human-check';

export type PublicRequestField = Readonly<{
  label: string;
  type: 'email' | 'text';
  autoComplete: 'email' | 'username';
  placeholder: string;
}>;

export type PublicRequestFormProps = Readonly<{
  siteKey: string | null;
  field: PublicRequestField;
  initialValue?: string;
  /** The value as the contracts DTO reads it, or the sentence of what is wrong with it. */
  parse: (value: string) => Readonly<{ value: string } | { problem: string }>;
  intentOf: (value: string, humanCheckToken: string) => SignUpIntent;
  submitLabel: string;
  /** What replaces the form once the server took the request (the same for any value). */
  sent: (value: string) => React.ReactNode;
}>;

/** The one-field public form (`/sign-up`, `/forgot-password`): the field, the Turnstile challenge
 *  (the button waits for it), and the notice once sent; every refusal in an alert.
 *
 *  Example: `<PublicRequestForm siteKey={key} field={EMAIL} parse={parseEmail} intentOf={…} submitLabel="Criar conta" sent={(email) => …} />` */
export function PublicRequestForm(props: PublicRequestFormProps): React.JSX.Element {
  const id = useId();
  const form = usePublicRequestForm(props, id);
  if (form.sentValue !== null) return <>{props.sent(form.sentValue)}</>;
  if (form.failure?.kind === 'registration_closed') {
    return <p className="text-[15px] text-muted-foreground">{SIGN_UP_CLOSED}</p>;
  }
  return (
    <form noValidate onSubmit={form.submit} aria-busy={form.busy} className="flex flex-col gap-5">
      <FormField id={id} label={props.field.label} error={form.problem}>
        <Input
          id={id}
          type={props.field.type}
          autoComplete={props.field.autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={props.field.placeholder}
          value={form.value}
          onChange={(event) => form.setValue(event.target.value)}
          aria-invalid={form.problem !== undefined}
          aria-describedby={form.problem ? `${id}-error` : undefined}
        />
      </FormField>
      {form.widget}
      {form.failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {signUpFailureMessage(form.failure)}
        </Alert>
      )}
      <Button type="submit" size="xl" disabled={form.busy || !form.ready}>
        {form.busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {form.busy ? 'Enviando…' : props.submitLabel}
      </Button>
    </form>
  );
}

type PublicRequestFormState = Readonly<{
  value: string;
  setValue: (value: string) => void;
  problem: string | undefined;
  busy: boolean;
  ready: boolean;
  widget: React.ReactNode;
  failure: SignUpFailure | null;
  sentValue: string | null;
  submit: (event: React.FormEvent) => void;
}>;

function usePublicRequestForm(props: PublicRequestFormProps, id: string): PublicRequestFormState {
  const fetcher = useFetcher<SignUpActionResult>();
  const check = useHumanCheck(props.siteKey);
  const [value, setValue] = useState(props.initialValue ?? '');
  const [submitted, setSubmitted] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const busy = fetcher.state !== 'idle';
  const settled = busy ? undefined : fetcher.data;
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsed = props.parse(value);
    setProblem('problem' in parsed ? parsed.problem : undefined);
    if ('problem' in parsed || check.token === null) return document.getElementById(id)?.focus();
    setSubmitted(parsed.value);
    check.renew();
    const intent = props.intentOf(parsed.value, check.token);
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  const failure = settled && 'failure' in settled ? settled.failure : null;
  const sentValue = settled && 'sent' in settled ? submitted : null;
  const ready = check.token !== null;
  return {
    value,
    setValue,
    problem,
    busy,
    ready,
    widget: check.widget,
    failure,
    sentValue,
    submit,
  };
}
