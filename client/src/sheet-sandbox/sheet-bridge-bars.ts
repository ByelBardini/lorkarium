import type { SheetBarCostDto, SheetFrameRequestDto, TokenBarDto } from '@lorkarium/contracts';
import type { SheetCommandResult, SheetCommands } from '@/services/sheet-commands';
import type { SheetsApi } from '@/services/sheets-api';
import {
  refusedByKind,
  refusedWith,
  SHEET_BRIDGE_DONE,
  type SheetBridgeAnswer,
} from './sheet-bridge-answer';
import { resolveSheetBar } from './resolve-sheet-bar';

/** The sheet's bars as the host sees them: the holder's (`null` = no holder, `'waiting'` = its
 *  source is loading) and where the commands go. */
export type SheetBarsTarget = Readonly<{
  campaignId: string;
  sheetId: string;
  bars: readonly TokenBarDto[] | null | 'waiting';
  commands: SheetCommands;
}>;

type AdjustRequest = Extract<SheetFrameRequestDto, { type: 'bars.adjust' }>;
type SpendRequest = Extract<SheetFrameRequestDto, { type: 'bars.spend' }>;

function noToken(request: string): SheetBridgeAnswer {
  return refusedWith('NO_TOKEN', `${request} refused: token not loaded`);
}

function answerOf(request: string, result: SheetCommandResult): SheetBridgeAnswer {
  if (result.ok) return SHEET_BRIDGE_DONE;
  return refusedWith(result.code, result.message ?? `${request} refused with ${result.code}`);
}

/** `bars.adjust`: the bar named by id or label becomes the `sheet:adjustBar` of its id.
 *
 *  Example: `await adjustSheetBar(target, { type: 'bars.adjust', requestId: '3', bar: 'PV', change })` */
export async function adjustSheetBar(
  target: SheetBarsTarget,
  request: AdjustRequest,
): Promise<SheetBridgeAnswer> {
  if (target.bars === 'waiting') return noToken('bars.adjust');
  const bar = resolveSheetBar(target.bars, request.bar);
  if (!bar.ok) return refusedWith(bar.code, bar.message);
  const { campaignId, sheetId, commands } = target;
  return answerOf(
    'bars.adjust',
    await commands.adjustBar(campaignId, sheetId, bar.barId, request.change),
  );
}

/** `bars.spend`: every name resolved first (one that matches no bar sends nothing), then one
 *  `sheet:spendBars`, all or nothing; INSUFFICIENT_BAR comes back with the server's message.
 *
 *  Example: `await spendSheetBars(target, { type: 'bars.spend', requestId: '4', costs: [{ bar: 'MP', amount: 6 }] })` */
export async function spendSheetBars(
  target: SheetBarsTarget,
  request: SpendRequest,
): Promise<SheetBridgeAnswer> {
  if (target.bars === 'waiting') return noToken('bars.spend');
  const costs: SheetBarCostDto[] = [];
  for (const cost of request.costs) {
    const bar = resolveSheetBar(target.bars, cost.bar);
    if (!bar.ok) return refusedWith(bar.code, bar.message);
    costs.push({ barId: bar.barId, amount: cost.amount });
  }
  const { campaignId, sheetId, commands } = target;
  return answerOf('bars.spend', await commands.spendBars(campaignId, sheetId, costs));
}

type CreateRequest = Extract<SheetFrameRequestDto, { type: 'bars.create' }>;

/** Where `bars.create` goes: the sheet's route, on the holder the server finds. */
export type SheetBarCreationTarget = Readonly<{
  campaignId: string;
  sheetId: string;
  api: Pick<SheetsApi, 'createBar'>;
}>;

/** `bars.create`: the server creates the bar on the holder (or finds it by label) and answers
 *  its id; a refusal keeps the server's code and text (`BAR_LIMIT`, `PERMISSION_NOT_DECLARED`).
 *
 *  Example: `await createSheetBar(target, { type: 'bars.create', requestId: '5', bar: { label: 'Fôlego', max: 6, color: 'gold' } })` */
export async function createSheetBar(
  target: SheetBarCreationTarget,
  request: CreateRequest,
): Promise<SheetBridgeAnswer> {
  const result = await target.api.createBar(target.campaignId, target.sheetId, {
    bar: request.bar,
  });
  if (result.ok) return { ok: true, value: result.value };
  if (result.refusal) return refusedWith(result.refusal.code, result.refusal.message);
  return refusedByKind('bars.create', result.failure.kind);
}
