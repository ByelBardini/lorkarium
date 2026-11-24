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
  type SheetViewDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RateWindowRule } from '@/lib/rate-window';
import type { AssetsApi } from '@/services/assets-api';
import type { DiceCommands } from '@/services/dice-commands';
import type { SheetCommands } from '@/services/sheet-commands';
import type { SheetImage, SheetsApi } from '@/services/sheets-api';
import type { SheetStoreState } from '@/stores/sheet-store';
import { localSheetViewSlot, type SheetViewSlot } from '@/stores/sheet-view-store';
import {
  admitted,
  refusedWith,
  SHEET_BRIDGE_DONE,
  type SheetBridgeAnswer,
  type SheetRateStamps,
} from './sheet-bridge-answer';
import { readSheetAsset, uploadSheetImage } from './sheet-bridge-assets';
import { diceRefusalOf, diceSettled, sheetRollOf } from './sheet-bridge-dice';
import {
  answerSheetTray,
  isSheetTrayRequest,
  type SheetTrayRequest,
  type SheetTrayTarget,
} from './sheet-bridge-tray';
import {
  isSheetDocumentRead,
  readSheetDocuments,
  type SheetDocumentRead,
  type SheetDocumentSources,
} from './sheet-bridge-documents';
import {
  adjustSheetBar,
  createSheetBar,
  spendSheetBars,
  type SheetBarsTarget,
} from './sheet-bridge-bars';
import {
  sameStats,
  setCharacterImage,
  setCharacterStats,
  type SheetCharacterCommands,
  type SheetCharacterTarget,
} from './sheet-bridge-character';
import { createConsoleIntake, hostConsoleNoticeOf, type SheetConsoleSink } from './sheet-console';
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
  /** Reads the token's portrait and the sheet's images, sends images to the sheet and creates
   *  bars on its holder (`bars.create`). */
  images: Pick<SheetsApi, 'image' | 'uploadImage' | 'createBar'>;
  commands: SheetCommands;
  /** `character.set` and `character.setImage` go out as the character's `character:update`. */
  characters: SheetCharacterCommands;
  /** Where `character.setImage` sends the portrait (a `token` image of the table). */
  assets: Pick<AssetsApi, 'upload'>;
  /** Where `documents.*` reads the table's public documents. */
  documents: SheetDocumentSources;
  dice: DiceCommands;
  clock: InteractionClock;
  /** Width / height of the roller's window: the physics box of the roll. */
  diceAspect: () => number;
  /** The room's tray and saved rolls of who looks (`dice.tray.*`, `dice.saved.list`); absent or
   *  `null` = no tray here (a spectator): those requests are refused `FORBIDDEN`. */
  diceTray?: SheetTrayTarget | null;
  /** The frame said `ready`: the room's watchdog stops waiting for it. */
  onReady?: () => void;
  /** The frame's console lines, past the host's own rate limit; absent = dropped (a player). */
  onConsole?: SheetConsoleSink;
  /** A line the host writes to the console as the frame connects (the JS the plan does not run). */
  notice?: string;
  /** Where `view.set` keeps the view state of who looks, read back into every `state`; absent =
   *  kept only by this host (gone when the frame remounts). */
  view?: SheetViewSlot;
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
/** Document reads by the sheet (`documents.list`, `documents.tabs` and `documents.readTab`
 *  together). */
export const SHEET_DOCUMENT_READ_RATE = { limit: 60, windowMs: 60_000 } as const;
/** Bars the sheet creates on its holder (`bars.create`): a sheet sets its bars up once. */
export const SHEET_BAR_CREATION_RATE = { limit: 10, windowMs: 60_000 } as const;
/** `view.set` of the sheet: generous, a sheet may keep its scroll as it moves. */
export const SHEET_VIEW_RATE = { limit: 60, windowMs: 10_000 } as const;

const RATES = {
  rolls: SHEET_DICE_RATE,
  characterWrites: SHEET_CHARACTER_RATE,
  uploads: SHEET_UPLOAD_RATE,
  reads: SHEET_ASSET_READ_RATE,
  documentReads: SHEET_DOCUMENT_READ_RATE,
  barCreations: SHEET_BAR_CREATION_RATE,
  views: SHEET_VIEW_RATE,
} as const satisfies Readonly<Record<string, RateWindowRule>>;
type RateName = keyof typeof RATES;

type ViewValue = SheetViewDto | null;
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
  view: SheetViewSlot;
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
    view: options.view ?? localSheetViewSlot(),
    image: NO_IMAGE,
    sent: null,
  };
  if (options.notice) bridge.console(hostConsoleNoticeOf(options.notice));
  const onMessage = (event: { data: unknown }): void => void receive(bridge, event.data);
  const push = (): void => pushState(bridge);
  const unsubscribers = [options.sheet.subscribe(push), options.token?.subscribe(push) ?? noop];
  options.port.addEventListener('message', onMessage);
  options.port.start();
  return { dispose: () => closeBridge(bridge, onMessage, unsubscribers) };
}

function noop(): void {}

function freshRates(): Record<RateName, SheetRateStamps> {
  const rates = {} as Record<RateName, SheetRateStamps>;
  for (const name of Object.keys(RATES) as RateName[]) rates[name] = { stamps: [] };
  return rates;
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

type EditRequest = Exclude<
  SheetFrameRequestDto,
  | { type: 'ready' | 'dice.roll' | 'assets.read' | 'view.set' }
  | SheetDocumentRead
  | SheetTrayRequest
>;

// The manifest first (what the template may ask at all), then the viewer's own right to edit.
async function answerOf(bridge: Bridge, request: SheetFrameRequestDto): Promise<SheetBridgeAnswer> {
  if (request.type === 'ready') return ready(bridge);
  const undeclared = permissionRefusalOf(request.type, declaredOf(bridge));
  if (undeclared) return refusedWith(undeclared.code, undeclared.message);
  if (request.type === 'dice.roll') return roll(bridge, request);
  if (request.type === 'view.set') return keepView(bridge, request.value);
  if (isSheetTrayRequest(request)) return tray(bridge, request);
  if (request.type === 'assets.read') {
    const read = () => readSheetAsset(bridge.options.images, request.assetId);
    return limited(bridge, 'reads', request.type, read);
  }
  if (isSheetDocumentRead(request)) {
    const { documents, campaignId } = bridge.options;
    const read = () => readSheetDocuments(documents, campaignId, request);
    return limited(bridge, 'documentReads', request.type, read);
  }
  if (!bridge.options.sheet.getState().sheet?.canEdit) {
    return refusedWith('FORBIDDEN', `${request.type} refused: this sheet is read-only here`);
  }
  return edit(bridge, request);
}

// Who looks keeps their own tab and scroll, even on a read-only sheet; no new `state` follows,
// or the frame would loop on its own echo.
function keepView(bridge: Bridge, view: ViewValue): Promise<SheetBridgeAnswer> {
  const remember = async (): Promise<SheetBridgeAnswer> => {
    bridge.view.remember(view);
    return SHEET_BRIDGE_DONE;
  };
  return limited(bridge, 'views', 'view.set', remember);
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
    case 'bars.create':
      return createBar(bridge, request);
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

function createBar(
  bridge: Bridge,
  request: Extract<SheetFrameRequestDto, { type: 'bars.create' }>,
): Promise<SheetBridgeAnswer> {
  const { campaignId, sheet, images } = bridge.options;
  const sheetId = sheet.getState().sheet?.id ?? '';
  const send = () => createSheetBar({ campaignId, sheetId, api: images }, request);
  return limited(bridge, 'barCreations', 'bars.create', send);
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

// Builds the viewer's own roll, so a read-only sheet may too; it shares the rolls' pace.
function tray(bridge: Bridge, request: SheetTrayRequest): Promise<SheetBridgeAnswer> {
  const { campaignId, sheet, dice, clock, diceAspect, diceTray } = bridge.options;
  const templateName = sheet.getState().template?.name ?? 'Ficha';
  const context = {
    ...{ target: diceTray ?? null, campaignId, dice, clock, diceAspect },
    pieceLabelOf: (label: string | null | undefined) => sheetRollLabelOf(templateName, label),
  };
  return limited(bridge, 'rolls', request.type, () => answerSheetTray(context, request));
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
  if (!result.ok) return diceRefusalOf('dice.roll', result.failure);
  await diceSettled(clock, result.settlesInMs);
  return { ok: true, value: sheetRollOf(result) };
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
  const state = sheetHostMessageDto.safeParse(stateMessageOf(next, bridge.view.current()));
  if (!state.success) return;
  bridge.sent = next;
  post(bridge, state.data);
}

function stateMessageOf({ token, image, values, canEdit }: Sent, view: ViewValue): unknown {
  const frameToken = token === null ? null : { name: token.name, image };
  const bars = token?.bars ?? [];
  const character = frameCharacterOf(token);
  return { type: 'state', token: frameToken, bars, values, canEdit, character, view };
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
