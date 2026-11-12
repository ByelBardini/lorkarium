import { isHexColor, SAVED_COLORS_MAX, type HexColorDto } from '@lorkarium/contracts';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contrastRatioOf } from '@/lib/color-contrast';
import { hexFromTyped } from '@/lib/custom-color';
import { planLimitMessage } from '@/lib/plan-limit-message';
import type { SavedColorsFailure } from '@/services/saved-colors-api';
import { useSavedColors } from '@/stores/saved-colors-store';
import { HexColorCanvas } from './hex-color-canvas';
import { useCustomColorLock } from './custom-color-locks';
import { SavedColorGrid } from './saved-color-grid';
import { useSavedColorsStore } from './use-saved-colors-store';

export type CustomColorPanelProps = Readonly<{
  /** Where the preview starts: a hex, or anything else for the accent color. */
  value: string | null | undefined;
  /** Called once, by "Usar cor" or by a click on a saved color. Closing is up to the owner. */
  onPick: (color: HexColorDto) => void;
  /** The background the color will be read on: warns below 4.5:1, without blocking. */
  legibleOn?: HexColorDto;
}>;

const START_COLOR: HexColorDto = '#c5a46d';
const READABLE_CONTRAST = 4.5;
const LIMIT_MESSAGE = `Limite de ${SAVED_COLORS_MAX} cores salvas. Exclua uma para salvar outra.`;

/** Color area, code field and the account's saved colors. Holds only a preview: it unmounts with
 *  the popover around it, which is what discards the preview on Esc or a click outside.
 *
 *  Example: `<CustomColorPanel value={color} onPick={apply} legibleOn="#15181d" />` */
export function CustomColorPanel({
  value,
  onPick,
  legibleOn,
}: CustomColorPanelProps): React.JSX.Element {
  const draft = useColorDraft(typeof value === 'string' && isHexColor(value) ? value : START_COLOR);
  const saved = useSavedColorList();
  const parsed = draft.parsed;
  const isFull = saved.colors.length >= SAVED_COLORS_MAX;
  // Saving is the account's customization, whoever's table the color is for.
  const saveLock = useCustomColorLock('account');
  const canSave = parsed !== null && !isFull && !saved.colors.includes(parsed) && saveLock === null;
  return (
    <div className="flex flex-col gap-3">
      <HexColorCanvas color={draft.shown} onDraft={draft.drag} />
      <HexCodeField
        typed={draft.typed}
        shown={draft.shown}
        invalid={parsed === null}
        onType={draft.type}
      />
      {parsed !== null && legibleOn !== undefined && (
        <ContrastNotice color={parsed} background={legibleOn} />
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={!canSave}
          title={saveLock ?? undefined}
          onClick={() => {
            if (parsed !== null) void saved.save(parsed);
          }}
        >
          Salvar
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={parsed === null}
          onClick={() => {
            if (parsed !== null) onPick(parsed);
          }}
        >
          Usar cor
        </Button>
      </div>
      <SavedColorGrid colors={saved.colors} onPick={onPick} onRemove={saved.remove} />
      <SavedColorsNotice isFull={isFull} problem={saved.problem} />
    </div>
  );
}

type ColorDraft = Readonly<{
  typed: string;
  shown: HexColorDto;
  parsed: HexColorDto | null;
  type: (text: string) => void;
  drag: (color: HexColorDto) => void;
}>;

// `shown` keeps the last valid color: the canvas cannot draw a half-typed code.
function useColorDraft(start: HexColorDto): ColorDraft {
  const [typed, setTyped] = useState<string>(start);
  const [shown, setShown] = useState<HexColorDto>(start);
  const type = (text: string): void => {
    setTyped(text);
    const color = hexFromTyped(text);
    if (color !== null) setShown(color);
  };
  const drag = (color: HexColorDto): void => {
    setTyped(color);
    setShown(color);
  };
  return { typed, shown, parsed: hexFromTyped(typed), type, drag };
}

function useSavedColorList(): Readonly<{
  colors: readonly HexColorDto[];
  problem: SavedColorsFailure | null;
  save: (color: HexColorDto) => Promise<void>;
  remove: (color: HexColorDto) => void;
}> {
  const store = useSavedColorsStore();
  const colors = useSavedColors(store, (state) => state.colors);
  const problem = useSavedColors(store, (state) => state.problem);
  useEffect(() => {
    void store.getState().load();
  }, [store]);
  const { save, remove } = store.getState();
  return { colors, problem, save, remove: (color) => void remove(color) };
}

function HexCodeField({
  typed,
  shown,
  invalid,
  onType,
}: Readonly<{
  typed: string;
  shown: HexColorDto;
  invalid: boolean;
  onType: (text: string) => void;
}>): React.JSX.Element {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={inputId} className="text-[13px] text-label">
        Código da cor
      </Label>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          style={{ background: shown }}
          className="size-9 shrink-0 rounded-full border border-input"
        />
        <Input
          id={inputId}
          value={typed}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onType(event.target.value)}
          className="h-9 font-mono text-sm"
        />
      </div>
      {invalid && (
        <p id={errorId} className="text-xs text-destructive-text">
          Use o formato #rrggbb.
        </p>
      )}
    </div>
  );
}

function ContrastNotice({
  color,
  background,
}: Readonly<{ color: HexColorDto; background: HexColorDto }>): React.JSX.Element | null {
  if (contrastRatioOf(color, background) >= READABLE_CONTRAST) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Pouco contraste com o fundo: pode ficar difícil de ler.
    </p>
  );
}

function SavedColorsNotice({
  isFull,
  problem,
}: Readonly<{
  isFull: boolean;
  problem: SavedColorsFailure | null;
}>): React.JSX.Element | null {
  if (problem !== null) {
    return (
      <p role="alert" className="text-xs text-destructive-text">
        {problemMessageOf(problem)}
      </p>
    );
  }
  return isFull ? <p className="text-xs text-muted-foreground">{LIMIT_MESSAGE}</p> : null;
}

function problemMessageOf(problem: SavedColorsFailure): string {
  switch (problem.kind) {
    case 'saved_colors_limit':
      return LIMIT_MESSAGE;
    case 'plan_limit':
      return planLimitMessage(problem.planLimit);
    case 'rate_limited':
      return `Muitas alterações seguidas. Tente de novo em ${problem.retryAfterSeconds} s.`;
    case 'offline':
      return 'Sem conexão com o servidor: as cores salvas podem estar desatualizadas.';
    case 'unauthenticated':
      return 'Sua sessão terminou. Entre de novo para usar as cores salvas.';
    default:
      return 'Não foi possível atualizar as cores salvas. Tente de novo.';
  }
}
