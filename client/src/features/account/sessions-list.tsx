import { type AccountSessionDto, deviceLabel } from '@lorkarium/contracts';
import { LaptopIcon, LogOutIcon, SmartphoneIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { sinceLabel } from '@/lib/since-label';
import { accountFailureMessage } from './account-messages';
import { SettingsRow } from './settings-row';
import { failureOf, useAccountFetcher, useOnSettled } from './use-account-fetcher';

export type SessionsListProps = Readonly<{
  sessions: readonly AccountSessionDto[];
  now: Date;
  /** A sentence for the section's status line ("Sessão encerrada."). */
  onNotice: (notice: string) => void;
}>;

/** "Onde você está conectado": this device first ("Este aparelho", no "Sair"), the others by last
 *  activity, each with "Sair"; "Sair de todos os outros" asks first. One fetcher for the list,
 *  because the row of a session that ended is gone before its answer settles.
 *
 *  Example: `<SessionsList sessions={sessions} now={now} onNotice={setNotice} />` */
export function SessionsList({ sessions, now, onNotice }: SessionsListProps): React.JSX.Element {
  const fetcher = useAccountFetcher();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const titleId = useId();
  const failure = failureOf(fetcher.settled);
  useOnSettled(fetcher.settled, (result) => {
    if (result.intent === 'session-revoke' && 'done' in result) onNotice('Sessão encerrada.');
    if ('revoked' in result) onNotice('Os outros aparelhos saíram da conta.');
  });
  const ordered = orderedSessions(sessions);
  const revoke = (sessionId: string): void => {
    setRevokingId(sessionId);
    fetcher.send({ intent: 'session-revoke', input: { sessionId } });
  };
  return (
    <SettingsRow
      title="Onde você está conectado"
      titleId={titleId}
      description="Cada navegador ou app em que você entrou. Saia dos que você não reconhece."
    >
      {failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {accountFailureMessage(failure)}
        </Alert>
      )}
      <ul aria-labelledby={titleId} className="flex flex-col gap-2">
        {ordered.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            now={now}
            revoking={fetcher.busy && revokingId === session.id}
            onRevoke={() => revoke(session.id)}
          />
        ))}
      </ul>
      {ordered.length > 1 && (
        <RevokeOthersButton
          busy={fetcher.busy}
          onConfirm={() => fetcher.send({ intent: 'sessions-revoke-others' })}
        />
      )}
    </SettingsRow>
  );
}

function orderedSessions(sessions: readonly AccountSessionDto[]): AccountSessionDto[] {
  return [...sessions].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
  });
}

type SessionRowProps = Readonly<{
  session: AccountSessionDto;
  now: Date;
  revoking: boolean;
  onRevoke: () => void;
}>;

function SessionRow({ session, now, revoking, onRevoke }: SessionRowProps): React.JSX.Element {
  const Icon = session.formFactor === 'mobile' ? SmartphoneIcon : LaptopIcon;
  const label = deviceLabel(session);
  return (
    <li className="flex flex-wrap items-center gap-4 border border-divider bg-card px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center bg-muted">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <div className="mr-auto flex min-w-0 flex-col">
        <span className="text-base text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          ativo {sinceLabel(session.lastSeenAt, now)}
        </span>
      </div>
      {session.current ? (
        <span className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Este aparelho
        </span>
      ) : (
        <Button
          variant="outline"
          size="lg"
          disabled={revoking}
          onClick={onRevoke}
          aria-label={`Sair de ${label}`}
        >
          <LogOutIcon aria-hidden="true" />
          {revoking ? 'Saindo…' : 'Sair'}
        </Button>
      )}
    </li>
  );
}

function RevokeOthersButton({
  busy,
  onConfirm,
}: Readonly<{ busy: boolean; onConfirm: () => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="self-start"
      >
        Sair de todos os outros
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair de todos os outros aparelhos?</AlertDialogTitle>
          <AlertDialogDescription>
            Só este aparelho continua na conta. Nos outros, vai ser preciso entrar de novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction size="lg" variant="destructive" onClick={onConfirm}>
            Sair de todos os outros
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
