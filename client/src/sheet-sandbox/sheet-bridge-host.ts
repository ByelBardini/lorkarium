import {
  DICE_ROLL_LABEL_MAX_LENGTH,
  SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH,
  sheetBridgeRequestIdDto,
  sheetFrameMessageDto,
  sheetHostMessageDto,
  type SheetFrameCharacterDto,
  type SheetFrameRequestDto,
  type SheetHostMessageDto,
  type SheetManifestPermissionDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RateWindowRule } from '@/lib/rate-window';
import type { AssetsApi } from '@/services/assets-api';
import type { DiceCommands, DiceRollFailure } from '@/services/dice-commands';
import type { SheetCommands } from '@/services/sheet-commands';
import type { SheetImage, SheetsApi } from '@/services/sheets-api';
import type { SheetStoreState } from '@/stores/sheet-store';
import {
  admitted,
  refusedWith,
  SHEET_BRIDGE_DONE,
  type SheetBridgeAnswer,
  type SheetRateStamps,
} from './sheet-bridge-answer';
import { readSheetAsset, uploadSheetImage } from './sheet-bridge-assets';
import { adjustSheetBar, spendSheetBars, type SheetBarsTarget } from './sheet-bridge-bars';
import {
  sameStats,
  setCharacterImage,
  setCharacterStats,
  type SheetCharacterCommands,
  type SheetCharacterTarget,
} from './sheet-bridge-character';
import { createConsoleIntake, type SheetConsoleSink } from './sheet-console';
import { permissionRefusalOf } from './sheet-permissions';
import type { SheetTokenSource, SheetTokenView } from './sheet-token-source';

/** The host's end of the sheet's `MessageChannel` (a browser `MessagePort` fits). */
export interface SheetHostPort {
  postMessage(message: SheetHostMessageDto): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  start(): void;
  close(): void;
}

export type SheetBridgeHostOptions = Readonly<{
  port: SheetHostPort;
  campaignId: string;
  sheet: StoreApi<SheetStoreState>;
  /** Where the sheet's token is read, or `null` for a sheet with no token (no holder): the frame
   *  then gets `token: null, bars: []` and `bars.adjust` is refused `NO_TOKEN`. A source whose
   *  `current()` is `null` is still loading, and no `state` goes until it has the token. */
  token: SheetTokenSource | null;
  /** Reads the token's portrait and the sheet's images, and sends images to the sheet. */
  images: Pick<SheetsApi, 'image' | 'uploadImage'>;
  commands: SheetCommands;
  /** `character.set` and `character.setImage` go out as the character's `character:update`. */
  characters: SheetCharacterCommands;
  /** Where `character.setImage` sends the portrait (a `token` image of the table). */
  assets: Pick<AssetsApi, 'upload'>;
  dice: DiceCommands;
  clock: InteractionClock;
  /** Width / height of the roller's window: the physics box of the roll. */
  diceAspect: () => number;
  /** The frame said `ready`: the room's watchdog stops waiting for it. */
  onReady?: () => void;
  /** The frame's console lines, past the host's own rate limit; absent = dropped (a player). */
  onConsole?: SheetConsoleSink;
}>;

export type SheetBridgeHost = Readonly<{ dispose: () => void }>;

/** More rolls than this in the window are refused in the host, before the server's bucket. */
export const SHEET_DICE_RATE = { limit: 10, windowMs: 10_000 } as const;
/** `character.set` writes of the sheet, the same pace as its rolls. */
export const SHEET_CHARACTER_RATE = { limit: 10, windowMs: 10_000 } as const;
/** Images sent by the sheet (`assets.upload` and `character.setImage` together). */
export const SHEET_UPLOAD_RATE = { limit: 10, windowMs: 60_000 } as const;
/** Images read by the sheet (`assets.read`): a long list may show many at once. */
export const SHEET_ASSET_READ_RATE = { limit: 120, windowMs: 60_000 } as const;

type RateName = 'rolls' | 'characterWrites' | 'uploads' | 'reads';
const RATES: Readonly<Record<RateName, RateWindowRule>> = {
  rolls: SHEET_DICE_RATE,
  characterWrites: SHEET_CHARACTER_RATE,
  uploads: SHEET_UPLOAD_RATE,
  reads: SHEET_ASSET_READ_RATE,
};

type ImageSlot = { assetId: string | null; image: SheetImage | null; loading: boolean };
const NO_IMAGE: ImageSlot = { assetId: null, image: null, loading: false };
type Sent = {
  token: SheetTokenView | null;
  image: SheetImage | null;
  values: unknown;
  canEdit: boolean;
};
type Bridge = {
  options: SheetBridgeHostOptions;
  console: SheetConsoleSink;
  ready: boolean;
  disposed: boolean;
  rates: Record<RateName, SheetRateStamps>;
  image: ImageSlot;
  sent: Sent | null;
};

/** Speaks for the frame of one sheet: sends it the confirmed `state` (again whenever the token or
 *  the values change) and turns its requests into the real commands, refused in the host when
 *  the viewer may not edit (the server refuses again).
 *
 *  Example: `const host = createSheetBridgeHost({ port, campaignId, sheet, token, images, commands, dice, clock, diceAspect })` */
export function createSheetBridgeHost(options: SheetBridgeHostOptions): SheetBridgeHost {
  const bridge: Bridge = {
    options,
    console: options.onConsole ? createConsoleIntake(options.clock.now, options.onConsole) : noop,
    ready: false,
    disposed: false,
    rates: freshRates(),
    image: NO_IMAGE,
    sent: null,
  };
  const onMessage = (event: { data: unknown }): void => void receive(bridge, event.data);
  const push = (): void => pushState(bridge);
  const unsubscribers = [options.sheet.subscribe(push), options.token?.subscribe(push) ?? noop];
  options.port.addEventListener('message', onMessage);
  options.port.start();
  return { dispose: () => closeBridge(bridge, onMessage, unsubscribers) };
}

function noop(): void {}

function freshRates(): Record<RateName, SheetRateStamps> {
  const empty = (): SheetRateStamps => ({ stamps: [] });
  return { rolls: empty(), characterWrites: empty(), uploads: empty(), reads: empty() };
}

function closeBridge(
  bridge: Bridge,
  onMessage: (event: { data: unknown }) => void,
  unsubscribers: readonly (() => void)[],
): void {
  bridge.disposed = true;
  for (const unsubscribe of unsubscribers) unsubscribe();
  bridge.options.port.removeEventListener('message', onMessage);
  bridge.options.port.close();
}

/** The label of a roll from the sheet, cut to what `dice:roll` takes.
 *
 *  Example: `sheetRollLabelOf('Ficha Tormenta', 'Ataque') // 'Ficha Tormenta · Ataque'` */
export function sheetRollLabelOf(templateName: string, label: string | null | undefined): string {
  const full = label ? `${templateName} · ${label}` : templateName;
  if (full.length <= DICE_ROLL_LABEL_MAX_LENGTH) return full;
  return `${full.slice(0, DICE_ROLL_LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}

async function receive(bridge: Bridge, data: unknown): Promise<void> {
  if (bridge.disposed) return;
  const parsed = sheetFrameMessageDto.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return postError(bridge, requestIdOf(data), 'INVALID_MESSAGE', message);
  }
  const request = parsed.data;
  if (request.type === 'console' || request.type === 'console.dropped')
    return bridge.console(request);
  const answer = await answerOf(bridge, request);
  if (!answer.ok) return postError(bridge, request.requestId, answer.code, answer.message);
  const { requestId } = request;
  post(
    bridge,
    answer.value
      ? { type: 'result', requestId, value: answer.value }
      : { type: 'result', requestId },
  );
}

type EditRequest = Exclude<SheetFrameRequestDto, { type: 'ready' | 'dice.roll' | 'assets.read' }>;

// The manifest first (what the template may ask at all), then the viewer's own right to edit.
async function answerOf(bridge: Bridge, request: SheetFrameRequestDto): Promise<SheetBridgeAnswer> {
  if (request.type === 'ready') return ready(bridge);
  const undeclared = permissionRefusalOf(request.type, declaredOf(bridge));
  if (undeclared) return refusedWith(undeclared.code, undeclared.message);
  if (request.type === 'dice.roll') return roll(bridge, request);
  if (request.type === 'assets.read') {
    const read = () => readSheetAsset(bridge.options.images, request.assetId);
    return limited(bridge, 'reads', request.type, read);
  }
  if (!bridge.options.sheet.getState().sheet?.canEdit) {
    return refusedWith('FORBIDDEN', `${request.type} refused: this sheet is read-only here`);
  }
  return edit(bridge, request);
}

function edit(bridge: Bridge, request: EditRequest): Promise<SheetBridgeAnswer> {
  switch (request.type) {
    case 'values.set':
      return setValues(bridge, request.changes);
    case 'values.patch':
      return patchValues(bridge, request.patches);
    case 'bars.adjust':
      return adjustSheetBar(barsTargetOf(bridge), request);
    case 'bars.spend':
      return spendSheetBars(barsTargetOf(bridge), request);
    case 'character.set':
      return setStats(bridge, request.changes);
    case 'character.setImage':
      return setImage(bridge, request.image);
    case 'assets.upload':
      return uploadImage(bridge, request.image);
  }
}

function declaredOf(bridge: Bridge): readonly SheetManifestPermissionDto[] {
  return bridge.options.sheet.getState().template?.manifest.permissions ?? [];
}

async function limited(
  bridge: Bridge,
  rate: RateName,
  request: string,
  run: () => Promise<SheetBridgeAnswer>,
): Promise<SheetBridgeAnswer> {
  const rule = RATES[rate];
  if (admitted(bridge.rates[rate], bridge.options.clock.now(), rule)) return run();
  const seconds = rule.windowMs / 1000;
  return refusedWith('RATE_LIMITED', `More than ${rule.limit} ${request} in ${seconds} s`);
}

async function ready(bridge: Bridge): Promise<SheetBridgeAnswer> {
  bridge.ready = true;
  bridge.sent = null;
  bridge.options.onReady?.();
  pushState(bridge);
  return SHEET_BRIDGE_DONE;
}

async function setValues(
  bridge: Bridge,
  changes: Extract<SheetFrameRequestDto, { type: 'values.set' }>['changes'],
): Promise<SheetBridgeAnswer> {
  const outcome = await bridge.options.sheet.getState().setValues(changes);
  if (outcome.ok) return SHEET_BRIDGE_DONE;
  return refusedWith(outcome.failure.kind.toUpperCase(), 'values.set was not saved');
}

async function patchValues(
  bridge: Bridge,
  patches: Extract<SheetFrameRequestDto, { type: 'values.patch' }>['patches'],
): Promise<SheetBridgeAnswer> {
  const outcome = await bridge.options.sheet.getState().patchValues(patches);
  if (outcome.ok) return SHEET_BRIDGE_DONE;
  return refusedWith(outcome.failure.kind.toUpperCase(), 'values.patch was not saved');
}

// The same numbers the character already has send nothing, and do not count against the pace.
function setStats(
  bridge: Bridge,
  changes: Extract<SheetFrameRequestDto, { type: 'character.set' }>['changes'],
): Promise<SheetBridgeAnswer> {
  const target = characterTargetOf(bridge);
  const { character } = target;
  if (character !== null && character !== 'waiting' && sameStats(character, changes))
    return Promise.resolve(SHEET_BRIDGE_DONE);
  const write = () => setCharacterStats(target, changes);
  return limited(bridge, 'characterWrites', 'character.set', write);
}

type FrameImage = Extract<SheetFrameRequestDto, { type: 'assets.upload' }>['image'];

function setImage(bridge: Bridge, image: FrameImage): Promise<SheetBridgeAnswer> {
  const send = () => setCharacterImage(characterTargetOf(bridge), bridge.options.assets, image);
  return limited(bridge, 'uploads', 'character.setImage', send);
}

function uploadImage(bridge: Bridge, image: FrameImage): Promise<SheetBridgeAnswer> {
  const { campaignId, sheet, images } = bridge.options;
  const sheetId = sheet.getState().sheet?.id;
  if (sheetId === undefined)
    return Promise.resolve(refusedWith('NOT_FOUND', 'assets.upload refused: no sheet'));
  const send = () => uploadSheetImage(images, campaignId, sheetId, image);
  return limited(bridge, 'uploads', 'assets.upload', send);
}

function barsTargetOf(bridge: Bridge): SheetBarsTarget {
  const { campaignId, sheet, commands } = bridge.options;
  const token = tokenOf(bridge);
  const bars = token === 'waiting' ? token : (token?.bars ?? null);
  return { campaignId, sheetId: sheet.getState().sheet?.id ?? '', bars, commands };
}

function characterTargetOf(bridge: Bridge): SheetCharacterTarget {
  const token = tokenOf(bridge);
  const character = token === 'waiting' ? token : (token?.character ?? null);
  return { campaignId: bridge.options.campaignId, character, commands: bridge.options.characters };
}

async function roll(
  bridge: Bridge,
  request: Extract<SheetFrameRequestDto, { type: 'dice.roll' }>,
): Promise<SheetBridgeAnswer> {
  const { campaignId, sheet, dice, clock, diceAspect } = bridge.options;
  if (!admitted(bridge.rates.rolls, clock.now(), SHEET_DICE_RATE)) {
    return refusedWith('RATE_LIMITED', `More than ${SHEET_DICE_RATE.limit} rolls in 10 s`);
  }
  const label = sheetRollLabelOf(sheet.getState().template?.name ?? 'Ficha', request.label);
  const parts = [{ label: null, expression: request.expression }];
  const visibility = request.visibility;
  const result = await dice.roll(campaignId, { label, parts, visibility, aspect: diceAspect() });
  return result.ok ? SHEET_BRIDGE_DONE : rollRefusalOf(result.failure);
}

function rollRefusalOf(failure: DiceRollFailure): SheetBridgeAnswer {
  if (failure.kind === 'invalid_expression') {
    return refusedWith('INVALID_DICE_EXPRESSION', failure.message);
  }
  return refusedWith(failure.kind.toUpperCase(), `dice.roll refused with ${failure.kind}`);
}

// `null` = the sheet has no token; 'waiting' = its source has not got the token yet.
function tokenOf(bridge: Bridge): SheetTokenView | null | 'waiting' {
  const source = bridge.options.token;
  if (source === null) return null;
  return source.current() ?? 'waiting';
}

function pushState(bridge: Bridge): void {
  const { sheet, values } = bridge.options.sheet.getState();
  const token = tokenOf(bridge);
  if (!bridge.ready || bridge.disposed || sheet === null || token === 'waiting') return;
  const image = token === null ? null : imageFor(bridge, token.imageAssetId);
  if (image === 'loading') return;
  const next: Sent = { token, image, values, canEdit: sheet.canEdit };
  if (sameAsSent(bridge.sent, next)) return;
  const state = sheetHostMessageDto.safeParse(stateMessageOf(next));
  if (!state.success) return;
  bridge.sent = next;
  post(bridge, state.data);
}

function stateMessageOf({ token, image, values, canEdit }: Sent): unknown {
  const frameToken = token === null ? null : { name: token.name, image };
  const bars = token?.bars ?? [];
  const character = frameCharacterOf(token);
  return { type: 'state', token: frameToken, bars, values, canEdit, character };
}

function frameCharacterOf(token: SheetTokenView | null): SheetFrameCharacterDto | null {
  const character = token?.character ?? null;
  if (character === null) return null;
  const { name, armorClass, difficultyClass } = character;
  return { name, armorClass, difficultyClass };
}

// A new holder object that changes nothing the frame sees (a note, a condition) sends nothing.
function sameAsSent(sent: Sent | null, next: Sent): boolean {
  if (sent === null) return false;
  return (
    sameHolderForFrame(sent.token, next.token) &&
    sent.image === next.image &&
    sent.values === next.values &&
    sent.canEdit === next.canEdit
  );
}

function sameHolderForFrame(sent: SheetTokenView | null, next: SheetTokenView | null): boolean {
  if (sent === next) return true;
  if (sent === null || next === null) return false;
  const shown = (token: SheetTokenView): string =>
    JSON.stringify([token.name, token.imageAssetId, token.bars, frameCharacterOf(token)]);
  return shown(sent) === shown(next);
}

// The image is read once per asset; the first `state` waits for it so the frame never shows a
// token without its picture first.
function imageFor(bridge: Bridge, assetId: string | null): SheetImage | null | 'loading' {
  const slot = bridge.image;
  if (assetId === null) return null;
  if (slot.assetId === assetId) return slot.loading ? 'loading' : slot.image;
  bridge.image = { assetId, image: null, loading: true };
  void bridge.options.images.image(assetId).then((result) => {
    if (bridge.image.assetId !== assetId) return;
    bridge.image = { assetId, image: result.ok ? result.value : null, loading: false };
    pushState(bridge);
  });
  return 'loading';
}

function requestIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('requestId' in data)) return null;
  const requestId = sheetBridgeRequestIdDto.safeParse(data.requestId);
  return requestId.success ? requestId.data : null;
}

function postError(bridge: Bridge, requestId: string | null, code: string, message: string): void {
  const text = message.slice(0, SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH);
  post(bridge, { type: 'error', requestId, code, message: text });
}

function post(bridge: Bridge, message: SheetHostMessageDto): void {
  if (bridge.disposed) return;
  bridge.options.port.postMessage(message);
}
