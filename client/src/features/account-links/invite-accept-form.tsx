import { usernameDto } from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AccountLinksActionResult, AccountLinksIntent } from './account-links-action';
import { linkFailureMessage, passwordProblems, usernameProblem } from './account-links-messages';

type FieldErrors = Readonly<{ username?: string; password?: string; repeated?: string }>;

export type InviteAcceptFormProps = Readonly<{
  token: string;
  suggestedUsername: string;
  /** Shown instead of the form when the invitation died meanwhile. */
  deadLink: React.ReactNode;
}>;

/** The @ (starting from the suggestion), the password twice and "Manter conectado"; checked by the
 *  contracts DTOs before the request. A taken @ comes back to its field.
 *
 *  Example: `<InviteAcceptForm token={token} suggestedUsername="marina" deadLink={…} />` */
export function InviteAcceptForm({
  token,
  suggestedUsername,
  deadLink,
}: InviteAcceptFormProps): React.JSX.Element {
  const ids = { username: useId(), password: useId(), repeated: useId(), persistent: useId() };
  const fetcher = useFetcher<AccountLinksActionResult>();
  const busy = fetcher.state !== 'idle';
  const failure = !busy && fetcher.data && 'failure' in fetcher.data ? fetcher.data.failure : null;
  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [persistent, setPersistent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  if (failure?.kind === 'link_invalid') return <>{deadLink}</>;
  const shown: FieldErrors =
    failure?.kind === 'username_taken'
      ? { ...errors, username: `@${usernameDto.parse(username)} já tem dono. Tente outro.` }
      : errors;
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const found: FieldErrors = {
      username: usernameProblem(username),
      ...passwordProblems(password, repeated),
    };
    setErrors(found);
    const first = (['username', 'password', 'repeated'] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }
    const intent: AccountLinksIntent = {
      intent: 'accept',
      token,
      username: usernameDto.parse(username),
      password,
      persistent,
    };
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return (
    <form noValidate onSubmit={submit} aria-busy={busy} className="flex flex-col gap-5">
      <FormField
        id={ids.username}
        label="Seu @"
        error={shown.username}
        hint="Letras minúsculas, números, ponto e _. Não muda depois."
      >
        <Input
          id={ids.username}
          autoFocus={failure?.kind === 'username_taken'}
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={shown.username !== undefined}
          aria-describedby={shown.username ? `${ids.username}-error` : undefined}
        />
      </FormField>
      <FormField id={ids.password} label="Senha" error={shown.password}>
        <PasswordField
          id={ids.password}
          value={password}
          onValueChange={setPassword}
          invalid={shown.password !== undefined}
          describedBy={shown.password ? `${ids.password}-error` : undefined}
          autoComplete="new-password"
        />
      </FormField>
      <FormField id={ids.repeated} label="Repita a senha" error={shown.repeated}>
        <PasswordField
          id={ids.repeated}
          value={repeated}
          onValueChange={setRepeated}
          invalid={shown.repeated !== undefined}
          describedBy={shown.repeated ? `${ids.repeated}-error` : undefined}
          autoComplete="new-password"
        />
      </FormField>
      <div className="flex min-h-6 items-center gap-2.5">
        <Checkbox
          id={ids.persistent}
          checked={persistent}
          onCheckedChange={(state) => setPersistent(state === true)}
        />
        <Label
          htmlFor={ids.persistent}
          className="cursor-pointer text-sm font-normal text-muted-foreground"
        >
          Manter conectado
        </Label>
      </div>
      {failure && failure.kind !== 'username_taken' && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {linkFailureMessage(failure)}
        </Alert>
      )}
      <Button type="submit" size="xl" disabled={busy}>
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Criando sua conta…' : 'Criar minha conta'}
      </Button>
    </form>
  );
}
