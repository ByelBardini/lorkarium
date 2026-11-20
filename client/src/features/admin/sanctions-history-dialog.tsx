import {
  APPEAL_NOTE_MAX_LENGTH,
  type AccountSanctionDto,
  type AdminUserDto,
  type RecordAppealRequestDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useOnceOnMount } from '@/lib/use-once-on-mount';
import type { SanctionsApi } from '@/services/sanctions-api';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { adminFailureMessage } from './admin-messages';
import {
  SANCTION_KIND_LABEL,
  appealLabel,
  dateLabel,
  ruleLabel,
  untilLabel,
} from './sanction-messages';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';

export type SanctionsHistoryDialogProps = Readonly<{
  user: AdminUserDto;
  api: Pick<SanctionsApi, 'history'>;
  onClose: () => void;
}>;

type HistoryState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed'; failure: UserAdminFailure }>
  | Readonly<{ kind: 'read'; sanctions: AccountSanctionDto[] }>;

/** "Medidas…": every measure of the account, the newest first, with its appeal; an open appeal is
 *  registered here (its arrival, or the decision with the note of the review).
 *
 *  Example: `<SanctionsHistoryDialog user={bia} api={sanctionsApi} onClose={close} />` */
export function SanctionsHistoryDialog(props: SanctionsHistoryDialogProps): React.JSX.Element {
  const [state, setState] = useState<HistoryState>({ kind: 'loading' });
  const [appealing, setAppealing] = useState<string | null>(null);
  useOnceOnMount(() => {
    void props.api.history(props.user.id).then((result) => {
      setState(
        result.ok
          ? { kind: 'read', sanctions: result.value }
          : { kind: 'failed', failure: result.failure },
      );
    });
  });
  const saved = (changed: AccountSanctionDto): void => {
    setAppealing(null);
    setState((current) =>
      current.kind === 'read'
        ? {
            kind: 'read',
            sanctions: current.sanctions.map((each) => (each.id === changed.id ? changed : each)),
          }
        : current,
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Medidas de @{props.user.username}</DialogTitle>
          <DialogDescription>
            A contestação chega por resposta ao e-mail da medida; registre aqui e responda em até 15
            dias.
          </DialogDescription>
        </DialogHeader>
        <HistoryBody state={state} appealing={appealing} onAppeal={setAppealing} onSaved={saved} />
      </DialogContent>
    </Dialog>
  );
}

type HistoryBodyProps = Readonly<{
  state: HistoryState;
  appealing: string | null;
  onAppeal: (sanctionId: string | null) => void;
  onSaved: (sanction: AccountSanctionDto) => void;
}>;

function HistoryBody({ state, appealing, onAppeal, onSaved }: HistoryBodyProps): React.JSX.Element {
  if (state.kind === 'loading') return <p role="status">Carregando as medidas…</p>;
  if (state.kind === 'failed') {
    return (
      <Alert variant="destructive" className="px-3.5 py-3 text-sm">
        {adminFailureMessage(state.failure)}
      </Alert>
    );
  }
  if (state.sanctions.length === 0)
    return <p className="text-muted-foreground">Nenhuma medida até agora.</p>;
  return (
    <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      {state.sanctions.map((sanction) => (
        <SanctionItem
          key={sanction.id}
          sanction={sanction}
          appealing={appealing === sanction.id}
          onAppeal={() => onAppeal(sanction.id)}
          onCancel={() => onAppeal(null)}
          onSaved={onSaved}
        />
      ))}
    </ul>
  );
}

type SanctionItemProps = Readonly<{
  sanction: AccountSanctionDto;
  appealing: boolean;
  onAppeal: () => void;
  onCancel: () => void;
  onSaved: (sanction: AccountSanctionDto) => void;
}>;

function SanctionItem({
  sanction,
  appealing,
  onAppeal,
  onCancel,
  onSaved,
}: SanctionItemProps): React.JSX.Element {
  const open = sanction.appeal?.outcome == null;
  return (
    <li className="flex flex-col gap-1 border-t border-divider pt-3 text-sm">
      <p className="font-medium">
        {SANCTION_KIND_LABEL[sanction.kind]} · {ruleLabel(sanction.rule)}
      </p>
      <p className="text-muted-foreground">
        {dateLabel(sanction.issuedAt)}
        {sanction.issuedBy ? ` por @${sanction.issuedBy}` : ''}
        {sanction.kind === 'suspension' ? ` · ${periodOf(sanction)}` : ''}
      </p>
      <p>{sanction.statement}</p>
      <p className="text-muted-foreground">{appealLabel(sanction.appeal)}</p>
      {sanction.appeal?.note && <p>{sanction.appeal.note}</p>}
      {open && !appealing && (
        <Button variant="outline" size="sm" className="self-start" onClick={onAppeal}>
          Registrar contestação
        </Button>
      )}
      {appealing && <AppealForm sanctionId={sanction.id} onCancel={onCancel} onSaved={onSaved} />}
    </li>
  );
}

function periodOf(sanction: AccountSanctionDto): string {
  return sanction.until ? untilLabel(new Date(sanction.until)) : 'sem prazo';
}

const STEP_OPTIONS = [
  { value: 'received', label: 'Chegou (ainda sem decisão)' },
  { value: 'upheld', label: 'Mantida' },
  { value: 'reverted', label: 'Revertida' },
] as const;

type Step = (typeof STEP_OPTIONS)[number]['value'];

type AppealFormProps = Readonly<{
  sanctionId: string;
  onCancel: () => void;
  onSaved: (sanction: AccountSanctionDto) => void;
}>;

function AppealForm({ sanctionId, onCancel, onSaved }: AppealFormProps): React.JSX.Element {
  const id = useId();
  const [step, setStep] = useState<Step>('received');
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const fetcher = useUsersFetcher();
  const failure = usersFailureOf(fetcher.settled);
  useOnUsersSettled(fetcher.settled, (result) => {
    if ('sanction' in result) onSaved(result.sanction);
  });
  const missingNote = step !== 'received' && note.trim() === '';
  const save = (): void => {
    setChecked(true);
    if (missingNote) return;
    const appeal: RecordAppealRequestDto =
      step === 'received' ? { outcome: 'received' } : { outcome: step, note: note.trim() };
    fetcher.send({ intent: 'appeal', sanctionId, appeal });
  };
  return (
    <div className="mt-2 flex flex-col gap-3">
      <ChoiceField legend="Contestação" value={step} options={STEP_OPTIONS} onChange={setStep} />
      {step !== 'received' && (
        <FormField
          id={id}
          label="Nota da revisão"
          error={checked && missingNote ? 'Escreva a nota da revisão.' : undefined}
        >
          <Textarea
            id={id}
            value={note}
            maxLength={APPEAL_NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
      )}
      {failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {adminFailureMessage(failure)}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={fetcher.busy} aria-busy={fetcher.busy} onClick={save}>
          Salvar contestação
        </Button>
        <Button variant="ghost" size="sm" disabled={fetcher.busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
