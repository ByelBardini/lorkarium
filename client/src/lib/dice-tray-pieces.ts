import type { SavedRollDto } from '@lorkarium/contracts';
import { DICE_PARTS_MAX, DiceNotationError, parseDiceExpression } from '@lorkarium/game-core';
import { savedRollPartsOf, type DiceTray, type TrayPiece } from './dice-tray';

/** A piece as it is asked for, before it gets its id. */
export type TrayPieceAsk = Readonly<{ label: string; expression: string }>;

/** How many parts the tray rolls now: the pieces, plus the loose formula when it is not blank.
 *
 *  Example: `trayPartCountOf(setLoose(EMPTY_TRAY, '1d20')) // 1` */
export function trayPartCountOf(tray: DiceTray): number {
  return tray.pieces.length + (tray.loose.trim() === '' ? 0 : 1);
}

/** Whether `count` more parts still fit in one roll (the `dice:roll` takes up to 10).
 *
 *  Example: `canAddTrayParts(EMPTY_TRAY, 1) // true` */
export function canAddTrayParts(tray: DiceTray, count: number): boolean {
  return trayPartCountOf(tray) + count <= DICE_PARTS_MAX;
}

/** One named piece more, last in the tray. A tray already at 10 parts comes back as it was (the
 *  same reference); an expression that does not read is a `RangeError` naming it.
 *
 *  Example: `addPiece(EMPTY_TRAY, { label: 'Bênção', expression: '1d4' }, randomUUID)` */
export function addPiece(tray: DiceTray, ask: TrayPieceAsk, newId: () => string): DiceTray {
  const expression = readablePieceOf(ask.expression);
  if (!canAddTrayParts(tray, 1)) return tray;
  return { ...tray, pieces: [...tray.pieces, { id: newId(), label: ask.label, expression }] };
}

/** Every part of a saved roll as pieces (the unlabeled ones named after it), or the same tray when
 *  they do not all fit: a saved roll comes whole or not at all.
 *
 *  Example: `addSavedRoll(EMPTY_TRAY, acerto, randomUUID).pieces // [{ label: 'Acerto', … }]` */
export function addSavedRoll(tray: DiceTray, saved: SavedRollDto, newId: () => string): DiceTray {
  const parts = savedRollPartsOf(saved);
  if (!canAddTrayParts(tray, parts.length)) return tray;
  const pieces: TrayPiece[] = parts.map((part) => ({
    id: newId(),
    label: part.label ?? saved.name,
    expression: part.expression,
  }));
  return { ...tray, pieces: [...tray.pieces, ...pieces] };
}

/** The tray without the piece `id`; an absent id gives the same tray back.
 *
 *  Example: `removePiece(tray, tray.pieces[0].id)` */
export function removePiece(tray: DiceTray, id: string): DiceTray {
  if (!tray.pieces.some((piece) => piece.id === id)) return tray;
  return { ...tray, pieces: tray.pieces.filter((piece) => piece.id !== id) };
}

function readablePieceOf(expression: string): string {
  const trimmed = expression.trim();
  try {
    parseDiceExpression(trimmed);
    return trimmed;
  } catch (error) {
    if (!(error instanceof DiceNotationError)) throw error;
    throw new RangeError(
      `Tray piece '${expression}' is unreadable (${error.message}); expected dice notation like '1d20+5'.`,
      { cause: error },
    );
  }
}
