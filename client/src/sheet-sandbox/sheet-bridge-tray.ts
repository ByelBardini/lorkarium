import {
  DICE_ROLL_PARTS_MAX,
  type SavedRollDto,
  type SheetFrameRequestDto,
  type SheetFrameTrayRollDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import {
  appliedModeOf,
  isTrayRollable,
  toRollParts,
  trayProblemOf,
  type TrayChoice,
} from '@/lib/dice-tray';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceCommands, DiceRollOutcome } from '@/services/dice-commands';
import type { DiceTrayStore } from '@/stores/dice-tray-store';
import type { SavedRollsStore } from '@/stores/saved-rolls-store';
import {
  refusedByKind,
  refusedWith,
  SHEET_BRIDGE_DONE,
  type SheetBridgeAnswer,
} from './sheet-bridge-answer';
import { diceRefusalOf, diceSettled, frameDiceOf } from './sheet-bridge-dice';

/** The viewer's tray and saved rolls at the sheet's table; absent for a spectator (no tray). */
export type SheetTrayTarget = Readonly<{
  tray: StoreApi<DiceTrayStore>;
  savedRolls: StoreApi<SavedRollsStore>;
}>;

export type SheetTrayRequest = Extract<
  SheetFrameRequestDto,
  { type: 'dice.tray.add' | 'dice.tray.addSaved' | 'dice.tray.roll' | 'dice.saved.list' }
>;

/** What the tray requests need from the host besides the target. */
export type SheetTrayContext = Readonly<{
  target: SheetTrayTarget | null;
  campaignId: string;
  /** Names a piece the sheet adds ("<template> · <label>"). */
  pieceLabelOf: (label: string | null | undefined) => string;
  dice: DiceCommands;
  clock: InteractionClock;
  diceAspect: () => number;
}>;

const TRAY_TYPES: ReadonlySet<string> = new Set([
  'dice.tray.add',
  'dice.tray.addSaved',
  'dice.tray.roll',
  'dice.saved.list',
]);

/** Whether the request is one of the room's tray (and saved rolls).
 *
 *  Example: `if (isSheetTrayRequest(request)) return answerSheetTray(context, request)` */
export function isSheetTrayRequest(request: SheetFrameRequestDto): request is SheetTrayRequest {
  return TRAY_TYPES.has(request.type);
}

/** Builds and rolls the room's tray of who looks at the sheet, and reads their saved rolls.
 *
 *  Example: `await answerSheetTray(context, { type: 'dice.tray.add', requestId: '1', expression: '1d4', label: 'Bênção' })` */
export async function answerSheetTray(
  context: SheetTrayContext,
  request: SheetTrayRequest,
): Promise<SheetBridgeAnswer> {
  const { target } = context;
  if (target === null) {
    return refusedWith('FORBIDDEN', `${request.type} refused: a spectator has no tray`);
  }
  switch (request.type) {
    case 'dice.tray.add':
      return addToTray(target, request.expression, context.pieceLabelOf(request.label));
    case 'dice.tray.addSaved':
      return addSavedToTray(target, request.savedRollId);
    case 'dice.tray.roll':
      return rollTray(context, target.tray);
    case 'dice.saved.list':
      return listSaved(target.savedRolls);
  }
}

function addToTray(target: SheetTrayTarget, expression: string, label: string): SheetBridgeAnswer {
  return trayAddAnswerOf(() => target.tray.getState().addPiece({ label, expression }));
}

/** The answer to `dice.tray.add` (the room's and the preview's): `adds` answers whether the piece
 *  fit; an unreadable one throws the tray's `RangeError`.
 *
 *  Example: `trayAddAnswerOf(() => store.getState().addPiece({ label, expression }))` */
export function trayAddAnswerOf(adds: () => boolean): SheetBridgeAnswer {
  try {
    return adds() ? SHEET_BRIDGE_DONE : trayFull(1);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return refusedWith('INVALID_DICE_EXPRESSION', error.message);
  }
}

/** `dice.tray.addSaved` with an id that is not among the viewer's saved rolls.
 *
 *  Example: `savedRollMissing(request.savedRollId)` */
export function savedRollMissing(savedRollId: string): SheetBridgeAnswer {
  return refusedWith(
    'SAVED_ROLL_NOT_FOUND',
    `dice.tray.addSaved found no saved roll ${savedRollId} of the viewer at this table`,
  );
}

async function addSavedToTray(
  target: SheetTrayTarget,
  savedRollId: string,
): Promise<SheetBridgeAnswer> {
  const loaded = await savedRollsOf(target.savedRolls);
  if (!loaded.ok) return refusedByKind('dice.tray.addSaved', loaded.kind);
  const saved = loaded.rolls.find((roll) => roll.id === savedRollId);
  if (!saved) return savedRollMissing(savedRollId);
  if (target.tray.getState().addSavedRoll(saved)) return SHEET_BRIDGE_DONE;
  return trayFull(saved.parts.length);
}

function trayFull(adding: number): SheetBridgeAnswer {
  return refusedWith(
    'TRAY_FULL',
    `The tray holds at most ${DICE_ROLL_PARTS_MAX} parts; it has no room for ${adding} more`,
  );
}

async function listSaved(store: StoreApi<SavedRollsStore>): Promise<SheetBridgeAnswer> {
  const loaded = await savedRollsOf(store);
  if (!loaded.ok) return refusedByKind('dice.saved.list', loaded.kind);
  return { ok: true, value: { rolls: [...loaded.rolls] } };
}

type SavedRollsLoad =
  Readonly<{ ok: true; rolls: readonly SavedRollDto[] }> | Readonly<{ ok: false; kind: string }>;

// The shared list the "Dados" tab keeps: listed once if no screen listed it yet.
function savedRollsOf(store: StoreApi<SavedRollsStore>): Promise<SavedRollsLoad> {
  const loaded = savedRollsLoadOf(store.getState());
  if (loaded) return Promise.resolve(loaded);
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe((state) => {
      const settled = savedRollsLoadOf(state);
      if (!settled) return;
      unsubscribe();
      resolve(settled);
    });
    store.getState().load();
  });
}

function savedRollsLoadOf(state: SavedRollsStore): SavedRollsLoad | null {
  if (state.loadFailure !== null) return { ok: false, kind: state.loadFailure.kind };
  return state.rolls === null ? null : { ok: true, rolls: state.rolls };
}

// The tab's own "Rolar": its "Quem vê" and mode, emptied once the server took it.
async function rollTray(
  context: SheetTrayContext,
  tray: StoreApi<DiceTrayStore>,
): Promise<SheetBridgeAnswer> {
  const { choice } = tray.getState();
  const parts = toRollParts(choice.tray, appliedModeOf(choice));
  if (parts === null) {
    return refusedWith(
      'TRAY_EMPTY',
      'dice.tray.roll needs at least one part in the tray; got an empty tray',
    );
  }
  if (!isTrayRollable(choice.tray)) {
    return refusedWith('INVALID_DICE_EXPRESSION', trayProblemOf(choice.tray)?.message ?? '');
  }
  const ask = {
    label: null,
    parts,
    visibility: visibilityOf(choice),
    aspect: context.diceAspect(),
  };
  const result = await context.dice.roll(context.campaignId, ask);
  if (!result.ok) return diceRefusalOf('dice.tray.roll', result.failure);
  tray.getState().clear();
  await diceSettled(context.clock, result.settlesInMs);
  return { ok: true, value: trayRollOf(result) };
}

function visibilityOf(choice: TrayChoice): 'public' | 'masters' {
  return choice.secret ? 'masters' : 'public';
}

function trayRollOf(outcome: DiceRollOutcome): SheetFrameTrayRollDto {
  const parts = outcome.parts.map((part) => ({
    label: part.label,
    expression: part.expression,
    total: part.total,
    dice: frameDiceOf(part.dice),
  }));
  return { total: outcome.total, parts };
}
