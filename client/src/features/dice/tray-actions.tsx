import { BookmarkIcon, EyeIcon, LockIcon } from 'lucide-react';
import { useState } from 'react';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  EMPTY_TRAY,
  appliedModeOf,
  isTrayEmpty,
  isTrayRollable,
  toRollParts,
  type TrayChoice,
} from '@/lib/dice-tray';
import { DieGlyph } from './die-glyph';
import { SaveRollForm } from './save-roll-form';
import type { DiceRoller } from './use-dice-roller';
import type { SavedRollsView } from './use-saved-rolls';

export type TrayActionsProps = Readonly<{
  choice: TrayChoice;
  onChoice: (choice: TrayChoice) => void;
  roller: DiceRoller;
  saved: SavedRollsView;
  /** Sends the tray (the editor's roll, shared with Enter in "Fórmula"). */
  onRoll: () => void;
}>;

/** The bottom of the tray: "Quem vê" and "Limpar", the refusal, the preview, "Rolar" and the
 *  bookmark that opens the line to save the formula.
 *
 *  Example: `<TrayActions choice={choice} onChoice={setChoice} roller={roller} saved={saved} onRoll={roll} />` */
export function TrayActions(props: TrayActionsProps): React.JSX.Element {
  const { choice, roller } = props;
  const [saving, setSaving] = useState(false);
  const rollable = isTrayRollable(choice.tray);
  return (
    <div className="flex flex-col gap-3">
      <AudienceLine choice={choice} onChoice={props.onChoice} />
      {roller.problem !== null && <RollRefusal problem={roller.problem} />}
      <RollPreview choice={choice} />
      <div className="flex gap-2">
        <Button
          className="h-12 flex-1 gap-2 text-[15px] font-semibold"
          disabled={!rollable || roller.busy}
          onClick={props.onRoll}
        >
          <DieGlyph sides={20} className="size-[18px]" />
          Rolar
        </Button>
        <SaveBookmark disabled={!rollable} open={saving} onToggle={() => setSaving(!saving)} />
      </div>
      {saving && rollable && (
        <SaveRollForm
          parts={toRollParts(choice.tray, 'normal') ?? []}
          saved={props.saved}
          onDone={() => setSaving(false)}
        />
      )}
    </div>
  );
}

function RollRefusal({ problem }: Readonly<{ problem: string }>): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertDescription>{problem}</AlertDescription>
    </Alert>
  );
}

type Audience = 'public' | 'masters';

const AUDIENCE_OPTIONS = [
  { value: 'public', label: 'Todos', mark: <EyeIcon aria-hidden="true" className="size-3.5" /> },
  {
    value: 'masters',
    label: 'Só o mestre',
    mark: <LockIcon aria-hidden="true" className="size-3.5" />,
  },
] as const satisfies readonly SegmentOption<Audience>[];

type ChoiceProps = Readonly<{ choice: TrayChoice; onChoice: (choice: TrayChoice) => void }>;

// "Limpar" is starting over: the mode goes back to Normal, "Quem vê" stays.
function AudienceLine({ choice, onChoice }: ChoiceProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <SegmentField
        legend="Quem vê"
        compact
        value={choice.secret ? 'masters' : 'public'}
        options={AUDIENCE_OPTIONS}
        onChange={(audience) => onChoice({ ...choice, secret: audience === 'masters' })}
      />
      <span className="flex-1" />
      <Button
        variant="ghost"
        disabled={isTrayEmpty(choice.tray)}
        onClick={() => onChoice({ ...choice, tray: EMPTY_TRAY, mode: 'normal' })}
        className="text-muted-foreground"
      >
        Limpar
      </Button>
    </div>
  );
}

function RollPreview({ choice }: Readonly<{ choice: TrayChoice }>): React.JSX.Element | null {
  if (!isTrayRollable(choice.tray)) return null;
  const parts = toRollParts(choice.tray, appliedModeOf(choice)) ?? [];
  return (
    <div className="border-l-2 border-primary/60 pl-3">
      <output aria-label="Prévia da rolagem" className="font-mono text-sm break-all text-label">
        {parts.map((part) => part.expression).join(' + ')}
      </output>
    </div>
  );
}

type SaveBookmarkProps = Readonly<{ disabled: boolean; open: boolean; onToggle: () => void }>;

function SaveBookmark({ disabled, open, onToggle }: SaveBookmarkProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            aria-label="Salvar esta rolagem"
            aria-expanded={open}
            disabled={disabled}
            onClick={onToggle}
            className="size-12 p-0"
          >
            <BookmarkIcon aria-hidden="true" className="size-[18px]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Salvar esta rolagem</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
