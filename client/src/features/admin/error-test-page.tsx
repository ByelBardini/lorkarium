import { BugIcon, Loader2Icon, ServerCrashIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ErrorReportsApi, ServerTestOutcome } from '@/services/error-reports-api';
import { ClientErrorTest } from './client-error-test';

const SERVER_MESSAGE: Readonly<Record<ServerTestOutcome, string>> = {
  'server-error': 'O server respondeu 500. Confira a issue no Sentry.',
  unexpected: 'O server não respondeu o 500 esperado. Confira se a sessão ainda é de admin.',
  offline: 'Sem conexão com o server. Tente de novo.',
};

const BROWSER_MESSAGE = 'Erro lançado no navegador. A issue aparece no Sentry em alguns segundos.';

export type ErrorTestPageProps = Readonly<{
  api: Pick<ErrorReportsApi, 'triggerServerTest'>;
  /** Throws outside React (a timer), the way a real bug of the page escapes. */
  scheduleThrow: (error: Error) => void;
}>;

/** "Teste de erros": a 500 of the server and an uncaught error of the browser, on purpose, to see
 *  the whole path to Sentry after a deploy.
 *
 *  Example: `<ErrorTestPage api={errorReportsApi} scheduleThrow={(e) => setTimeout(() => { throw e; })} />` */
export function ErrorTestPage({ api, scheduleThrow }: ErrorTestPageProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const testServer = async (): Promise<void> => {
    setBusy(true);
    setStatus(null);
    const outcome = await api.triggerServerTest();
    setBusy(false);
    setStatus(SERVER_MESSAGE[outcome]);
  };
  const testBrowser = (): void => {
    scheduleThrow(new ClientErrorTest());
    setStatus(BROWSER_MESSAGE);
  };
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Teste de erros</title>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[42px] leading-[1.05] font-medium">Teste de erros</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Gera um erro de propósito para conferir que ele chega ao Sentry. Um mesmo erro do server
          vira um relato só por minuto.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void testServer()} disabled={busy}>
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <ServerCrashIcon aria-hidden="true" />
          )}
          {busy ? 'Gerando…' : 'Gerar erro no server'}
        </Button>
        <Button type="button" variant="outline" onClick={testBrowser}>
          <BugIcon aria-hidden="true" />
          Gerar erro no navegador
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-foreground">
        {status}
      </p>
    </div>
  );
}
