import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import {
  EMPTY_TRAY,
  appliedModeOf,
  chooseMode,
  isTrayRollable,
  toRollParts,
  trayAdvantageBlockOf,
  type DiceRollMode,
  type DiceTray,
  type TrayChoice,
} from '@/lib/dice-tray';
import { advantageHintOf, modeHintOf } from './dice-messages';
import { FormulaField } from './formula-field';
import { TrayActions } from './tray-actions';
import { TrayAdjusters } from './tray-adjusters';
import { TrayDiceGrid } from './tray-dice-grid';
import type { DiceRoller } from './use-dice-roller';
import type { SavedRollsView } from './use-saved-rolls';

export type DiceTrayEditorProps = Readonly<{
  choice: TrayChoice;
  onChoice: (choice: TrayChoice) => void;
  roller: DiceRoller;
  saved: SavedRollsView;
}>;

/** "Montar rolagem": the dice by click with their count, the modifier and any die, the mode,
 *  "Fórmula", "Quem vê", the preview, "Rolar" and the bookmark. A roll the server took empties
 *  the tray (the mode and "Quem vê" stay).
 *
 *  Example: `<DiceTrayEditor choice={choice} onChoice={setChoice} roller={roller} saved={saved} />` */
export function DiceTrayEditor(props: DiceTrayEditorProps): React.JSX.Element {
  const { choice, onChoice, roller } = props;
  const { tray } = choice;
  const setTray = (next: DiceTray) => onChoice({ ...choice, tray: next });
  const roll = () => void rollTray(choice, onChoice, roller);
  return (
    <section aria-label="Montar rolagem" className="flex flex-col gap-4">
      <TrayDiceGrid tray={tray} onTray={setTray} />
      <TrayAdjusters tray={tray} onTray={setTray} />
      <ModeField choice={choice} onChoice={onChoice} />
      <FormulaField tray={tray} onTray={setTray} onEnter={roll} />
      <TrayActions {...props} onRoll={roll} />
    </section>
  );
}

async function rollTray(
  choice: TrayChoice,
  onChoice: (choice: TrayChoice) => void,
  roller: DiceRoller,
): Promise<void> {
  const parts = toRollParts(choice.tray, appliedModeOf(choice));
  if (parts === null || !isTrayRollable(choice.tray) || roller.busy) return;
  const visibility = choice.secret ? 'masters' : 'public';
  const ok = await roller.roll({ label: null, parts, visibility });
  if (ok) onChoice({ ...choice, tray: EMPTY_TRAY });
}

type ChoiceProps = Readonly<{ choice: TrayChoice; onChoice: (choice: TrayChoice) => void }>;

const MODE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  {
    value: 'advantage',
    label: 'Vantagem',
    mark: <ArrowUpIcon aria-hidden="true" className="size-3.5" />,
  },
  {
    value: 'disadvantage',
    label: 'Desvantagem',
    mark: <ArrowDownIcon aria-hidden="true" className="size-3.5" />,
  },
] as const satisfies readonly SegmentOption<DiceRollMode>[];

// Without dice the mode stays free: choosing it puts the d20 (`chooseMode`).
function ModeField({ choice, onChoice }: ChoiceProps): React.JSX.Element {
  const block = trayAdvantageBlockOf(choice.tray);
  const blocked = block !== null && block !== 'no-dice';
  const applied = appliedModeOf(choice);
  const options = MODE_OPTIONS.map((option) => ({
    ...option,
    disabled: blocked && option.value !== 'normal',
  }));
  return (
    <SegmentField
      legend="Modo da rolagem"
      compact
      fill
      value={applied}
      options={options}
      hint={advantageHintOf(block) ?? modeHintOf(applied) ?? undefined}
      onChange={(mode) => onChoice(chooseMode(choice, mode))}
    />
  );
}
