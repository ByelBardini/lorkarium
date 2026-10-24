import { sendMailSampleRequestDto, type MailSampleDto } from '@lorkarium/contracts';
import { Loader2Icon, SendIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useFetcher } from 'react-router';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminFailureMessage } from './admin-messages';
import type { MailTestIntent, MailTestResult } from './mail-test-action';

const INVALID_ADDRESS = 'Informe um e-mail válido, como voce@exemplo.com.';

export type MailTestPageProps = Readonly<{
  samples: readonly MailSampleDto[];
  /** The admin's own address, the field starts with it. */
  defaultTo: string;
}>;

/** "E-mails": one sample of every system e-mail, sent to the typed address by its own button,
 *  through the real mailer — the way to see how each one arrives (and that the SMTP works).
 *
 *  Example: `<MailTestPage samples={samples} defaultTo={user.email} />` */
export function MailTestPage({ samples, defaultTo }: MailTestPageProps): React.JSX.Element {
  const fieldId = useId();
  const [to, setTo] = useState(defaultTo);
  const [error, setError] = useState<string | undefined>();
  const fetcher = useFetcher<MailTestResult>();
  const busy = fetcher.state !== 'idle';
  const sending = busy && fetcher.json ? (fetcher.json as MailTestIntent).sampleId : null;
  const result = busy ? undefined : fetcher.data;
  const send = (sampleId: string): void => {
    const parsed = sendMailSampleRequestDto.safeParse({ to });
    setError(parsed.success ? undefined : INVALID_ADDRESS);
    if (!parsed.success) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    const intent: MailTestIntent = { sampleId, to: parsed.data.to };
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · E-mails</title>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[42px] leading-[1.05] font-medium">E-mails</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mande um exemplo de cada e-mail do sistema para conferir como ele chega. Os dados são de
          amostra e os links não levam a lugar nenhum.
        </p>
      </header>
      <div className="w-full max-w-sm">
        <FormField id={fieldId} label="E-mail de destino" error={error}>
          <Input
            id={fieldId}
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
        </FormField>
      </div>
      <p role="status" className="min-h-5 text-sm text-foreground">
        {result && 'subject' in result ? `“${result.subject}” enviado para ${result.to}.` : null}
      </p>
      {result && 'failure' in result && (
        <Alert variant="destructive" className="max-w-xl px-3.5 py-3 text-sm">
          {adminFailureMessage(result.failure)}
        </Alert>
      )}
      <ul aria-label="E-mails do sistema" className="flex w-full max-w-2xl flex-col">
        {samples.map((sample) => (
          <SampleRow
            key={sample.id}
            sample={sample}
            sending={sending === sample.id}
            disabled={busy}
            onSend={() => send(sample.id)}
          />
        ))}
      </ul>
    </div>
  );
}

type SampleRowProps = Readonly<{
  sample: MailSampleDto;
  sending: boolean;
  disabled: boolean;
  onSend: () => void;
}>;

function SampleRow({ sample, sending, disabled, onSend }: SampleRowProps): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 border-t border-divider py-3">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-foreground">{sample.name}</span>
        <span className="truncate text-[13px] text-muted-foreground">{sample.subject}</span>
      </div>
      <Button
        variant="outline"
        size="lg"
        disabled={disabled}
        aria-label={`Enviar ${sample.name}`}
        onClick={onSend}
      >
        {sending ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <SendIcon aria-hidden="true" />
        )}
        {sending ? 'Enviando…' : 'Enviar'}
      </Button>
    </li>
  );
}
