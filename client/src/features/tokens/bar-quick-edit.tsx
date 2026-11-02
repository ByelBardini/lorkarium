import type { BarChangeDto, TokenBarDto } from '@lorkarium/contracts';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { BAR_MAX_PROBLEM, BAR_TEMP_PROBLEM } from '@/features/tokens/token-messages';
import { parseBarInput, parseBarMax, parseBarTemp } from '@/lib/bar-input';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';

/** Whose bar it is: a token's on its grid, or a character's itself (the card, the dock without
 *  a token of it). */
export type BarTarget = Readonly<{ tokenId: string }> | Readonly<{ characterId: string }>;

export type BarQuickEditProps = Readonly<{
  target: BarTarget;
  bar: TokenBarDto;
  /** Names the bar: "PV de Lyra". */
  name: string;
  interaction: StoreApi<BoardInteractionStore>;
  children: ReactNode;
}>;

const HOW_TO_WRITE = 'Escreva −7, +5 ou 12.';

/** A bar that whoever controls the token or character edits in place (the party card and the dock): a double click (or
 *  Enter / Space on it) opens a balloon over it with "Atual" (−7 takes, the temp first; +5 adds;
 *  12 sets), "Máx" and "Temp". Enter or leaving a field sends it; Esc closes without sending.
 *  Never opens while reconnecting.
 *
 *  Example: `<BarQuickEdit target={{ tokenId: lyra.id }} bar={pv} name="PV de Lyra" interaction={interaction}>…</BarQuickEdit>` */
export function BarQuickEdit({ target, bar, name, interaction, children }: BarQuickEditProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const openIt = (): void => {
    if (readOnly) return;
    setOpen(true);
  };
  const adjust = (change: BarChangeDto): void => adjustBarOf(interaction, target, bar.id, change);
  return (
    <Popover open={open && !readOnly} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Editar ${name}`}
          aria-haspopup="dialog"
          title="Clique duas vezes para editar"
          aria-expanded={open}
          onDoubleClick={openIt}
          onKeyDown={(event) => opensOnKey(event, openIt)}
          className="rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent side="top" aria-labelledby={titleId} className="w-64">
        <p
          id={titleId}
          className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          {bar.label}
        </p>
        <BalloonFields bar={bar} adjust={adjust} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function adjustBarOf(
  interaction: StoreApi<BoardInteractionStore>,
  target: BarTarget,
  barId: string,
  change: BarChangeDto,
): void {
  if ('tokenId' in target)
    return void interaction.getState().adjustBar(target.tokenId, barId, change);
  const { characterId } = target;
  void interaction
    .getState()
    .command((commands, scope) => commands.adjustCharacterBar(scope, characterId, barId, change));
}

function opensOnKey(event: KeyboardEvent<HTMLElement>, open: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  open();
}

type BalloonFieldsProps = Readonly<{
  bar: TokenBarDto;
  adjust: (change: BarChangeDto) => void;
  onDone: () => void;
}>;

function BalloonFields({ bar, adjust, onDone }: BalloonFieldsProps) {
  const sendCurrent = (text: string): string | null => {
    const parsed = parseBarInput(text);
    if (parsed.kind === 'invalid') return HOW_TO_WRITE;
    adjust(parsed.change);
    return null;
  };
  const sendMax = (text: string): string | null => {
    const value = parseBarMax(text);
    if (value === null) return BAR_MAX_PROBLEM;
    adjust({ op: 'max', value });
    return null;
  };
  const sendTemp = (text: string): string | null => {
    const value = parseBarTemp(text);
    if (value === null) return BAR_TEMP_PROBLEM;
    adjust({ op: 'temp', value });
    return null;
  };
  return (
    <div className="flex gap-2">
      <BalloonField
        label="Atual"
        initial={String(bar.current)}
        send={sendCurrent}
        autoFocus
        onDone={onDone}
      />
      <BalloonField label="Máx" initial={String(bar.max)} send={sendMax} onDone={onDone} />
      <BalloonField label="Temp" initial={String(bar.temp)} send={sendTemp} onDone={onDone} />
    </div>
  );
}

type BalloonFieldProps = Readonly<{
  label: 'Atual' | 'Máx' | 'Temp';
  initial: string;
  /** Sends the text; answers the problem to show, or `null` when it went. */
  send: (text: string) => string | null;
  autoFocus?: boolean;
  onDone: () => void;
}>;

function BalloonField(props: BalloonFieldProps) {
  const id = useId();
  const field = useBalloonField(props);
  return (
    <div className="flex flex-1 flex-col gap-1 text-xs">
      <label htmlFor={id} className="text-label">
        {props.label}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        autoFocus={props.autoFocus}
        value={field.text}
        aria-invalid={field.problem ? true : undefined}
        aria-describedby={field.problem ? `${id}-problem` : undefined}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => field.setText(event.target.value)}
        onBlur={() => field.commit(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          field.commit(true);
        }}
        className="h-9 text-sm tabular-nums"
      />
      {field.problem && (
        <span id={`${id}-problem`} className="text-destructive-text">
          {field.problem}
        </span>
      )}
    </div>
  );
}

// The text last sent is the new base: leaving the field again does not send it twice. Esc needs
// no guard: the balloon unmounts the field and React fires no blur on an unmounted one.
function useBalloonField({ initial, send, onDone }: BalloonFieldProps) {
  const [text, setText] = useState(initial);
  const [base, setBase] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const commit = (closing: boolean): void => {
    const changed = text.trim() !== base;
    const found = changed ? send(text) : null;
    setProblem(found);
    if (found) return;
    setBase(text.trim());
    if (closing) onDone();
  };
  return { text, setText, problem, commit };
}
