import type { TokenPatrolGaitDto, TokenPatrolRepeatDto } from '@lorkarium/contracts';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DISCONNECTED_COMMAND } from '@/features/board/board-messages';
import { cellsText } from '@/lib/cells-text';
import { cn } from '@/lib/utils';
import {
  patrolDraftCanRestart,
  patrolDraftMoves,
  usePatrolEditor,
  type PatrolDraft,
  type TokenPatrolEditor,
} from '@/stores/token-patrol-flow';
import {
  SPEED_PRESETS,
  canStepSpeed,
  patrolSummaryOf,
  speedText,
  steppedSpeed,
} from './patrol-form-state';
import { PATROL_EDITOR_HINT, patrolFailureMessage, patrolPanelTitle } from './patrol-messages';

export type PatrolPanelProps = Readonly<{
  editor: StoreApi<TokenPatrolEditor>;
  /** Live: without the connection nothing can be saved (there is no queue). */
  connected: boolean;
}>;

const REPEAT_OPTIONS: readonly SegmentOption<TokenPatrolRepeatDto>[] = [
  { value: 'loop', label: 'Circuito' },
  { value: 'bounce', label: 'Ida e volta' },
];

const GAIT_OPTIONS: readonly SegmentOption<TokenPatrolGaitDto>[] = [
  { value: 'glide', label: 'Deslizando' },
  { value: 'step', label: 'Casa em casa' },
];

/** The master's patrol editor, floating over the board while it is open: the speed (shortcuts with their
 *  value, or "Personalizado" in steps of 0,25), what the route does at its end, how the token moves between
 *  cells, whether it turns, the lap summary and Salvar / Cancelar / Remover patrulha. The points come from clicks on the map;
 *  Backspace, Enter and Esc work wherever the focus is, outside a field.
 *
 *  Example: `<PatrolPanel editor={patrolEditor} connected={status === 'live'} />` */
export function PatrolPanel({ editor, connected }: PatrolPanelProps): React.JSX.Element | null {
  const draft = usePatrolEditor(editor, (state) => state.draft);
  usePatrolKeys(editor, draft !== null);
  if (!draft) return null;
  return (
    <section
      aria-label={patrolPanelTitle(draft.tokenName)}
      className="absolute top-16 left-16 flex w-72 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{patrolPanelTitle(draft.tokenName)}</h2>
        <p className="text-xs text-muted-foreground">{PATROL_EDITOR_HINT}</p>
      </header>
      <SpeedField editor={editor} speed={draft.speed} />
      <SegmentField
        legend="No fim do caminho"
        value={draft.repeat}
        options={REPEAT_OPTIONS}
        onChange={editor.getState().setRepeat}
        fill
      />
      <SegmentField
        legend="Como anda"
        value={draft.gait}
        options={GAIT_OPTIONS}
        onChange={editor.getState().setGait}
        fill
      />
      <TurnsSwitch editor={editor} turns={draft.turns} />
      <RouteSummary editor={editor} draft={draft} />
      <PatrolActions editor={editor} draft={draft} connected={connected} />
    </section>
  );
}

type SpeedFieldProps = Readonly<{ editor: StoreApi<TokenPatrolEditor>; speed: number }>;

function SpeedField({ editor, speed }: SpeedFieldProps): React.JSX.Element {
  const { setSpeed } = editor.getState();
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2.5">
      <span id={id} className="text-[13px] text-label">
        Velocidade (casas por segundo)
      </span>
      <div className="grid grid-cols-3 gap-2">
        {SPEED_PRESETS.map((preset) => (
          <SpeedPreset
            key={preset.label}
            label={preset.label}
            speed={preset.speed}
            pressed={speed === preset.speed}
            onChoose={setSpeed}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">Personalizado</span>
        <SpeedStepper speed={speed} onSpeed={setSpeed} />
      </div>
    </div>
  );
}

type SpeedPresetProps = Readonly<{
  label: string;
  speed: number;
  pressed: boolean;
  onChoose: (speed: number) => void;
}>;

function SpeedPreset({ label, speed, pressed, onChoose }: SpeedPresetProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChoose(speed)}
      className={cn(
        'flex h-13 flex-col-reverse items-center justify-center gap-0.5 rounded-md border text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
        pressed ? 'border-primary bg-muted text-foreground' : 'border-input',
      )}
    >
      <span className="text-[11px]">{label}</span>{' '}
      <span className="text-[15px] font-semibold">{cellsText(speed)}</span>
    </button>
  );
}

type SpeedStepperProps = Readonly<{ speed: number; onSpeed: (speed: number) => void }>;

function SpeedStepper({ speed, onSpeed }: SpeedStepperProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Mais devagar"
        disabled={!canStepSpeed(speed, -1)}
        onClick={() => onSpeed(steppedSpeed(speed, -1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <output aria-live="polite" className="min-w-24 text-center text-sm">
        {speedText(speed)}
      </output>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Mais rápido"
        disabled={!canStepSpeed(speed, 1)}
        onClick={() => onSpeed(steppedSpeed(speed, 1))}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

type TurnsSwitchProps = Readonly<{ editor: StoreApi<TokenPatrolEditor>; turns: boolean }>;

function TurnsSwitch({ editor, turns }: TurnsSwitchProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-[13px] text-label">
        Virar para onde anda
      </Label>
      <Switch id={id} checked={turns} onCheckedChange={editor.getState().setTurns} />
    </div>
  );
}

type RouteSummaryProps = Readonly<{ editor: StoreApi<TokenPatrolEditor>; draft: PatrolDraft }>;

function RouteSummary({ editor, draft }: RouteSummaryProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[13px] text-label">{patrolSummaryOf(draft)}</p>
      {patrolDraftCanRestart(draft) && (
        <Button type="button" size="sm" variant="ghost" onClick={editor.getState().restart}>
          Redesenhar
        </Button>
      )}
    </div>
  );
}

type PatrolActionsProps = Readonly<{
  editor: StoreApi<TokenPatrolEditor>;
  draft: PatrolDraft;
  connected: boolean;
}>;

function PatrolActions({ editor, draft, connected }: PatrolActionsProps): React.JSX.Element {
  const busy = usePatrolEditor(editor, (state) => state.busy);
  const failure = usePatrolEditor(editor, (state) => state.failure);
  const actions = editor.getState();
  const idle = connected && !busy;
  return (
    <div aria-busy={busy} className="flex flex-col gap-3">
      {failure && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {patrolFailureMessage(failure)}
        </Alert>
      )}
      {!connected && <p className="text-[13px] text-muted-foreground">{DISCONNECTED_COMMAND}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {draft.saved && (
          <Button
            type="button"
            variant="ghost"
            disabled={!idle}
            onClick={() => void actions.remove()}
          >
            Remover patrulha
          </Button>
        )}
        <Button type="button" variant="outline" onClick={actions.cancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!idle || !patrolDraftMoves(draft)}
          onClick={() => void actions.save()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

// Enter on a button, a radio or the switch is that control's own; keys typed in a field, a menu or
// a dialog belong to them.
function ownedByControl(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return true;
  return key === 'Enter' && target.closest('button, [role="radio"], [role="switch"]') !== null;
}

function patrolKeyAction(editor: TokenPatrolEditor, key: string): (() => unknown) | null {
  if (key === 'Enter') return editor.save;
  if (key === 'Backspace') return editor.removeLastPoint;
  return key === 'Escape' ? editor.cancel : null;
}

function usePatrolKeys(editor: StoreApi<TokenPatrolEditor>, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (ownedByControl(event.target, event.key)) return;
      const action = patrolKeyAction(editor.getState(), event.key);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      void action();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [editor, open]);
}

export type RoomPatrolPanelProps = Readonly<{
  editor: StoreApi<TokenPatrolEditor>;
  presence: StoreApi<TablePresenceStore>;
}>;

/** The `PatrolPanel` of the room, saving only while the table is live.
 *
 *  Example: `{table && <RoomPatrolPanel editor={patrol.editor} presence={table.presence} />}` */
export function RoomPatrolPanel({ editor, presence }: RoomPatrolPanelProps): React.JSX.Element {
  const live = useTablePresence(presence, (state) => state.status === 'live');
  return <PatrolPanel editor={editor} connected={live} />;
}
