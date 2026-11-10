import { spendBars, type BarCost, type BarValues } from '@lorkarium/game-core';
import { CharacterBarNotFoundError } from '../characters/characters.error';
import { BarNotFoundError } from '../tokens/tokens.error';
import { InsufficientBarError } from './sheets.error';

/** Who pays: the sheet's holder (`SheetItemBo.requireHolder`). */
export type SheetBarHolder = Readonly<{ tokenId: string }> | Readonly<{ characterId: string }>;

export type HeldBar = Readonly<{ id: string; label: string } & BarValues>;

export type SheetBarWrite = Readonly<{ barId: string; values: BarValues }>;

/** The writes of `sheet:spendBars`, all or nothing: every cost names one of the holder's bars
 *  (else BAR_NOT_FOUND, before any balance), and each bar pays from its current value alone
 *  (else INSUFFICIENT_BAR citing the first bar short). Only the bars that paid are written.
 *
 *  Example: `spentBarWritesOf({ characterId }, row.bars, [{ barId: mpId, amount: 6 }])` */
export function spentBarWritesOf(
  holder: SheetBarHolder,
  bars: readonly HeldBar[],
  costs: readonly BarCost[],
): SheetBarWrite[] {
  const missing = costs.find(({ barId }) => !bars.some((bar) => bar.id === barId));
  if (missing) throw barNotFound(holder, missing.barId);
  const outcome = spendBars(bars, costs);
  if (!outcome.ok) throw new InsufficientBarError(outcome.bar, outcome.has, outcome.needs);
  return outcome.spent.map(({ id, current, max, temp }) => ({
    barId: id,
    values: { current, max, temp },
  }));
}

function barNotFound(holder: SheetBarHolder, barId: string): Error {
  if ('characterId' in holder) return new CharacterBarNotFoundError(holder.characterId, barId);
  return new BarNotFoundError(holder.tokenId, barId);
}
