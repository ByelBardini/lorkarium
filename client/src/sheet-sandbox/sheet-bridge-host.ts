import {
  DICE_ROLL_LABEL_MAX_LENGTH,
  SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH,
  sheetBridgeRequestIdDto,
  sheetFrameMessageDto,
  sheetHostMessageDto,
  type SheetFrameRequestDto,
  type SheetHostMessageDto,
} from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import { admitInWindow } from '@/lib/rate-window';
import type { DiceCommands, DiceRollFailure } from '@/services/dice-commands';
import type { SheetCommands } from '@/services/sheet-commands';
import type { SheetImage, SheetsApi } from '@/services/sheets-api';
import type { SheetStoreState } from '@/stores/sheet-store';
import { resolveSheetBar } from './resolve-sheet-bar';
import { createConsoleIntake, type SheetConsoleSink } from './sheet-console';
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
  images: Pick<SheetsApi, 'image'>;
  commands: SheetCommands;
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
  rolls: readonly number[];
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
    rolls: [],
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
  const code = await answerOf(bridge, request);
  if (code === null) return post(bridge, { type: 'result', requestId: request.requestId });
  postError(bridge, request.requestId, code.code, code.message);
}

type Refusal = Readonly<{ code: string; message: string }> | null;

function answerOf(bridge: Bridge, request: SheetFrameRequestDto): Promise<Refusal> {
  if (request.type === 'ready') return ready(bridge);
  if (request.type === 'dice.roll') return roll(bridge, request);
  if (!bridge.options.sheet.getState().sheet?.canEdit) {
    return refusedWith('FORBIDDEN', `${request.type} refused: this sheet is read-only here`);
  }
  if (request.type === 'values.set') return setValues(bridge, request.changes);
  return adjustBar(bridge, request);
}

async function ready(bridge: Bridge): Promise<Refusal> {
  bridge.ready = true;
  bridge.sent = null;
  bridge.options.onReady?.();
  pushState(bridge);
  return null;
}

async function setValues(
  bridge: Bridge,
  changes: Extract<SheetFrameRequestDto, { type: 'values.set' }>['changes'],
): Promise<Refusal> {
  const outcome = await bridge.options.sheet.getState().setValues(changes);
  if (outcome.ok) return null;
  return { code: outcome.failure.kind.toUpperCase(), message: 'values.set was not saved' };
}

async function adjustBar(
  bridge: Bridge,
  request: Extract<SheetFrameRequestDto, { type: 'bars.adjust' }>,
): Promise<Refusal> {
  const { campaignId, sheet, commands } = bridge.options;
  const sheetId = sheet.getState().sheet?.id;
  if (sheetId === undefined) return refusedWith('NOT_FOUND', 'bars.adjust refused: no sheet');
  const token = tokenOf(bridge);
  if (token === 'waiting') return refusedWith('NO_TOKEN', 'bars.adjust refused: token not loaded');
  const bar = resolveSheetBar(token?.bars ?? null, request.bar);
  if (!bar.ok) return { code: bar.code, message: bar.message };
  const result = await commands.adjustBar(campaignId, sheetId, bar.barId, request.change);
  if (result.ok) return null;
  return { code: result.code, message: `bars.adjust refused with ${result.code}` };
}

async function roll(
  bridge: Bridge,
  request: Extract<SheetFrameRequestDto, { type: 'dice.roll' }>,
): Promise<Refusal> {
  const { campaignId, sheet, dice, clock, diceAspect } = bridge.options;
  const admission = admitInWindow(bridge.rolls, clock.now(), SHEET_DICE_RATE);
  bridge.rolls = admission.stamps;
  if (!admission.admitted) {
    return refusedWith('RATE_LIMITED', `More than ${SHEET_DICE_RATE.limit} rolls in 10 s`);
  }
  const label = sheetRollLabelOf(sheet.getState().template?.name ?? 'Ficha', request.label);
  const parts = [{ label: null, expression: request.expression }];
  const visibility = request.visibility;
  const result = await dice.roll(campaignId, { label, parts, visibility, aspect: diceAspect() });
  return result.ok ? null : rollRefusalOf(result.failure);
}

function rollRefusalOf(failure: DiceRollFailure): Refusal {
  if (failure.kind === 'invalid_expression') {
    return { code: 'INVALID_DICE_EXPRESSION', message: failure.message };
  }
  return { code: failure.kind.toUpperCase(), message: `dice.roll refused with ${failure.kind}` };
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
  return { type: 'state', token: frameToken, bars: token?.bars ?? [], values, canEdit };
}

function sameAsSent(sent: Sent | null, next: Sent): boolean {
  if (sent === null) return false;
  return (
    sent.token === next.token &&
    sent.image === next.image &&
    sent.values === next.values &&
    sent.canEdit === next.canEdit
  );
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

function refusedWith(code: string, message: string): Promise<Refusal> {
  return Promise.resolve({ code, message });
}

function postError(bridge: Bridge, requestId: string | null, code: string, message: string): void {
  const text = message.slice(0, SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH);
  post(bridge, { type: 'error', requestId, code, message: text });
}

function post(bridge: Bridge, message: SheetHostMessageDto): void {
  if (bridge.disposed) return;
  bridge.options.port.postMessage(message);
}
