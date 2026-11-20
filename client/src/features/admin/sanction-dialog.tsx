import {
  SANCTION_KINDS,
  SANCTION_RULES,
  SANCTION_STATEMENT_MAX_LENGTH,
  type AdminUserDto,
  type IssueSanctionRequestDto,
  type SanctionKind,
  type SanctionRule,
} from '@lorkarium/contracts';
import { Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { adminFailureMessage } from './admin-messages';
import {
  SANCTION_KIND_LABEL,
  measureNotice,
  previewLines,
  ruleOptionLabel,
} from './sanction-messages';
import { useOnUsersSettled, usersFailureOf, useUsersFetcher } from './use-users-fetcher';

/** A measure started elsewhere: "Suspender em vez disso" after a blocked ban, or a report of the
 *  queue (`reportId`). */
export type SanctionDraft = Readonly<{
  kind?: SanctionKind;
  rule?: SanctionRule;
  statement?: string;
  reportId?: string;
}>;

/** What the deletion dialog needs to delete as a measure (a ban). */
export type BanMeasure = Readonly<{ rule: SanctionRule; statement: string; reportId?: string }>;

export type SanctionDialogProps = Readonly<{
  user: AdminUserDto;
  draft?: SanctionDraft;
  /** The measure is in the list: the page writes `message` in its notice. */
  onDone: (message: string) => void;
  /** "Exclusão da conta" goes on to the deletion dialog (the billing is cancelled there). */
  onBan: (measure: BanMeasure) => void;
  onClose: () => void;
}>;

const KIND_OPTIONS = SANCTION_KINDS.map((kind) => ({
  value: kind,
  label: SANCTION_KIND_LABEL[kind],
}));

type Draft = Readonly<{
  kind: SanctionKind;
  rule: SanctionRule | '';
  statement: string;
  until: string;
}>;

/** "Aplicar medida…": the measure of the scale, the rule of the use policy, the reasons the person
 *  reads and, for a suspension, an optional end; the e-mail's facts show before confirming.
 *
 *  Example: `<SanctionDialog user={bia} onDone={notify} onBan={openDeletion} onClose={close} />` */
export function SanctionDialog(props: SanctionDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(props.draft));
  const [checked, setChecked] = useState(false);
  const fetcher = useUsersFetcher();
  const failure = usersFailureOf(fetcher.settled);
  useOnUsersSettled(fetcher.settled, (result) => {
    if ('user' in result) props.onDone(measureNotice(draft.kind, props.user.username));
  });
  const missing = missingOf(draft);
  const submit = (): void => {
    setChecked(true);
    if (missing.rule || missing.statement || draft.rule === '') return;
    const statement = draft.statement.trim();
    const reportId = props.draft?.reportId;
    if (draft.kind === 'ban')
      return props.onBan({ rule: draft.rule, statement, ...(reportId ? { reportId } : {}) });
    const sanction = requestOf(draft, draft.rule, reportId);
    fetcher.send({ intent: 'sanction', userId: props.user.id, sanction });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !fetcher.busy && props.onClose()}>
      <DialogContent className="sm:max-w-lg" aria-busy={fetcher.busy}>
        <DialogHeader>
          <DialogTitle>Aplicar medida a @{props.user.username}</DialogTitle>
          <DialogDescription>
            A pessoa recebe um e-mail com a regra, o motivo e como contestar. O e-mail não diz quem
            aplicou.
          </DialogDescription>
        </DialogHeader>
        <SanctionFields
          draft={draft}
          errors={checked ? missing : NO_MISSING}
          failure={failure}
          onChange={(change) => setDraft((current) => ({ ...current, ...change }))}
        />
        <MeasurePreviewBlock draft={draft} />
        {failure && !fieldFailure(failure) && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {adminFailureMessage(failure)}
          </Alert>
        )}
        <SanctionFooter
          kind={draft.kind}
          busy={fetcher.busy}
          onCancel={props.onClose}
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  );
}

function initialDraft(draft: SanctionDraft | undefined): Draft {
  return {
    kind: draft?.kind ?? 'warning',
    rule: draft?.rule ?? '',
    statement: draft?.statement ?? '',
    until: '',
  };
}

type Missing = Readonly<{ rule: boolean; statement: boolean }>;

const NO_MISSING: Missing = { rule: false, statement: false };

function missingOf(draft: Draft): Missing {
  return { rule: draft.rule === '', statement: draft.statement.trim() === '' };
}

function requestOf(
  draft: Draft,
  rule: SanctionRule,
  reportId: string | undefined,
): IssueSanctionRequestDto {
  const until =
    draft.kind === 'suspension' && draft.until ? new Date(draft.until).toISOString() : null;
  return {
    kind: draft.kind,
    rule,
    statement: draft.statement.trim(),
    ...(until ? { until } : {}),
    ...(reportId ? { reportId } : {}),
  };
}

// Refusals that belong to a field show under it; the rest go to the alert of the dialog.
function fieldFailure(failure: UserAdminFailure): boolean {
  return failure.kind === 'already_suspended' || failure.kind === 'sanction_until_past';
}

type SanctionFieldsProps = Readonly<{
  draft: Draft;
  errors: Missing;
  failure: UserAdminFailure | null;
  onChange: (change: Partial<Draft>) => void;
}>;

function SanctionFields({
  draft,
  errors,
  failure,
  onChange,
}: SanctionFieldsProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <ChoiceField
        legend="Medida"
        value={draft.kind}
        options={KIND_OPTIONS}
        onChange={(kind) => onChange({ kind })}
      />
      {failure?.kind === 'already_suspended' && (
        <p role="alert" className="-mt-2 text-[13px] text-destructive-text">
          {adminFailureMessage(failure)}
        </p>
      )}
      <RuleField
        id={`${id}-rule`}
        value={draft.rule}
        error={errors.rule}
        onChange={(rule) => onChange({ rule })}
      />
      <FormField
        id={`${id}-statement`}
        label="Motivo (a pessoa lê este texto)"
        error={errors.statement ? 'Escreva o motivo que a pessoa vai ler.' : undefined}
      >
        <Textarea
          id={`${id}-statement`}
          value={draft.statement}
          maxLength={SANCTION_STATEMENT_MAX_LENGTH}
          onChange={(event) => onChange({ statement: event.target.value })}
        />
      </FormField>
      {draft.kind === 'suspension' && (
        <FormField
          id={`${id}-until`}
          label="Até (vazio = sem prazo)"
          error={failure?.kind === 'sanction_until_past' ? adminFailureMessage(failure) : undefined}
        >
          <Input
            id={`${id}-until`}
            type="datetime-local"
            value={draft.until}
            onChange={(event) => onChange({ until: event.target.value })}
          />
        </FormField>
      )}
    </div>
  );
}

type RuleFieldProps = Readonly<{
  id: string;
  value: SanctionRule | '';
  error: boolean;
  onChange: (rule: SanctionRule | '') => void;
}>;

function RuleField({ id, value, error, onChange }: RuleFieldProps): React.JSX.Element {
  return (
    <FormField
      id={id}
      label="Regra da Política de uso"
      error={error ? 'Escolha a regra que a conta violou.' : undefined}
    >
      <select
        id={id}
        value={value}
        onChange={(event) =>
          onChange(SANCTION_RULES.find((rule) => rule === event.target.value) ?? '')
        }
        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20"
      >
        <option value="">Escolha a regra</option>
        {SANCTION_RULES.map((rule) => (
          <option key={rule} value={rule}>
            {ruleOptionLabel(rule)}
          </option>
        ))}
      </select>
    </FormField>
  );
}

function MeasurePreviewBlock({ draft }: Readonly<{ draft: Draft }>): React.JSX.Element {
  const { rule } = draft;
  const ready = rule !== '' && draft.statement.trim() !== '';
  const until = draft.until ? new Date(draft.until) : null;
  return (
    <section
      aria-label="Prévia do e-mail"
      className="flex flex-col gap-1 rounded-lg border border-divider px-3.5 py-3 text-sm"
    >
      <h3 className="text-[13px] text-label">Prévia do e-mail</h3>
      {ready ? (
        previewLines({ kind: draft.kind, rule, statement: draft.statement, until }).map((line) => (
          <p key={line}>{line}</p>
        ))
      ) : (
        <p className="text-muted-foreground">
          Escolha a regra e escreva o motivo para ver a prévia.
        </p>
      )}
      <p className="text-muted-foreground">
        A pessoa contesta respondendo ao e-mail; uma pessoa revê em até 15 dias.
      </p>
    </section>
  );
}

type SanctionFooterProps = Readonly<{
  kind: SanctionKind;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}>;

function SanctionFooter({
  kind,
  busy,
  onCancel,
  onSubmit,
}: SanctionFooterProps): React.JSX.Element {
  const label = kind === 'ban' ? 'Continuar para a exclusão' : 'Aplicar medida';
  return (
    <DialogFooter>
      <Button variant="outline" size="lg" disabled={busy} onClick={onCancel}>
        Cancelar
      </Button>
      <Button
        variant={kind === 'warning' || kind === 'content_removal' ? 'default' : 'destructive'}
        size="lg"
        disabled={busy}
        aria-busy={busy}
        onClick={onSubmit}
      >
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Aplicando…' : label}
      </Button>
    </DialogFooter>
  );
}
