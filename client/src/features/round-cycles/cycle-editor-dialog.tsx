import { ROUND_CYCLE_PHASES_MAX, ROUND_CYCLE_PHASES_MIN } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  draftProblem,
  fieldsOfDraft,
  withPhaseAdded,
  withPhaseChanged,
  withPhaseMoved,
  withPhaseRemoved,
  type RoundCycleDraft,
} from '@/lib/round-cycle-form';
import type { RoundCycleFields } from '@/services/round-cycle-commands';
import { CycleAudienceFields, type CyclePlayer } from './cycle-audience-fields';
import { CyclePhaseRow, type CycleImageTarget } from './cycle-phase-row';

/** One choice of "Pertence a": the table, a character or a loose token. */
export type CycleHolderOption = Readonly<{ key: string; label: string }>;

export type CycleEditorDialogProps = Readonly<{
  title: string;
  initial: RoundCycleDraft;
  holders: readonly CycleHolderOption[];
  players: readonly CyclePlayer[];
  images: CycleImageTarget;
  /** Saves; answers whether the server confirmed (a refusal keeps the dialog open). */
  onSave: (fields: RoundCycleFields) => Promise<boolean>;
  onClose: () => void;
}>;

/** "Novo ciclo" / "Editar ciclo", wide: the name and the phases in order on the left (what the
 *  cycle is), whose it is, who sees, who chooses and the announcement on the right (how it plays);
 *  the actions stay at the foot, with why it cannot be saved yet.
 *
 *  Example: `<CycleEditorDialog title="Novo ciclo" initial={NEW_CYCLE_DRAFT} holders={holders} players={players} images={images} onSave={save} onClose={close} />` */
export function CycleEditorDialog(props: CycleEditorDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(props.initial);
  const [shownProblem, setShownProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const problem = draftProblem(draft);
    setShownProblem(problem);
    if (problem !== null) return;
    setBusy(true);
    const saved = await props.onSave(fieldsOfDraft(draft));
    setBusy(false);
    if (saved) props.onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="flex h-[min(46rem,90svh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <header className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription className="mt-1">
            Uma sequência de fases que vira sozinha no começo de cada rodada do combate.
          </DialogDescription>
        </header>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_19rem] md:overflow-hidden">
            <div className="flex min-h-0 flex-col gap-6 px-6 py-5 md:overflow-y-auto">
              <NameField draft={draft} onChange={setDraft} />
              <PhaseList draft={draft} images={props.images} onChange={setDraft} />
            </div>
            <aside
              aria-label="Como o ciclo joga"
              className="flex min-h-0 flex-col gap-6 border-t border-border bg-panel px-5 py-5 md:overflow-y-auto md:border-t-0 md:border-l"
            >
              <HolderField draft={draft} holders={props.holders} onChange={setDraft} />
              <CycleAudienceFields draft={draft} players={props.players} onChange={setDraft} />
              <AnnounceField draft={draft} onChange={setDraft} />
            </aside>
          </div>
          <footer className="flex items-center gap-3 border-t border-border px-6 py-4">
            <p role="alert" className="min-w-0 flex-1 text-sm text-destructive-text">
              {shownProblem}
            </p>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Salvar ciclo
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldsProps = Readonly<{ draft: RoundCycleDraft; onChange: (draft: RoundCycleDraft) => void }>;

function NameField({ draft, onChange }: FieldsProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Nome</Label>
      <Input
        id={id}
        value={draft.name}
        maxLength={40}
        placeholder="Ex.: Fases da Lua"
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        className="h-11 text-base"
      />
    </div>
  );
}

function HolderField({
  draft,
  holders,
  onChange,
}: FieldsProps & Readonly<{ holders: readonly CycleHolderOption[] }>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Pertence a</Label>
      <Select value={draft.holder} onValueChange={(holder) => onChange({ ...draft, holder })}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {holders.map((holder) => (
            <SelectItem key={holder.key} value={holder.key}>
              {holder.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Um ciclo de personagem ou token só entra no combate em que ele está.
      </p>
    </div>
  );
}

function PhaseList({
  draft,
  images,
  onChange,
}: FieldsProps & Readonly<{ images: CycleImageTarget }>) {
  const count = draft.phases.length;
  const full = count >= ROUND_CYCLE_PHASES_MAX;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-[13px] font-medium text-label">
          Fases, na ordem
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} de {ROUND_CYCLE_PHASES_MAX}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {draft.phases.map((phase, index) => (
          <CyclePhaseRow
            key={phase.key}
            phase={phase}
            place={index + 1}
            count={count}
            canRemove={count > ROUND_CYCLE_PHASES_MIN}
            images={images}
            onChange={(change) => onChange(withPhaseChanged(draft, phase.key, change))}
            onMove={(by) => onChange(withPhaseMoved(draft, phase.key, by))}
            onRemove={() => onChange(withPhaseRemoved(draft, phase.key))}
          />
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="border-dashed"
        disabled={full}
        onClick={() => onChange(withPhaseAdded(draft))}
      >
        <PlusIcon aria-hidden="true" />
        Adicionar fase
      </Button>
      <p className="text-xs text-muted-foreground">
        Todo combate começa na primeira fase. Clique no quadrado ou solte nele uma imagem ou GIF.
      </p>
    </section>
  );
}

function AnnounceField({ draft, onChange }: FieldsProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        <span>Anunciar cada fase para todos</span>
        <span className="text-xs font-normal text-muted-foreground">
          Um aviso na virada da rodada, para a mesa inteira, mesmo quem não vê o ciclo.
        </span>
      </Label>
      <Switch
        id={id}
        checked={draft.announce}
        onCheckedChange={(checked) => onChange({ ...draft, announce: checked })}
      />
    </div>
  );
}
