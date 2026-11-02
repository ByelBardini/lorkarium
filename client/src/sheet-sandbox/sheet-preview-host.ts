import {
  BAR_VALUE_LIMIT,
  sheetBridgeRequestIdDto,
  sheetFrameMessageDto,
  sheetHostMessageDto,
  type SheetFrameRequestDto,
  type SheetHostMessageDto,
  type SheetValuesDto,
  type TokenBarDto,
} from '@lorkarium/contracts';
import { adjustBarValues } from '@lorkarium/game-core';
import { resolveSheetBar } from './resolve-sheet-bar';
import type { SheetHostPort } from './sheet-bridge-host';
import { createConsoleIntake, type SheetConsoleSink } from './sheet-console';

/** The id of the sample bar ("PV 20/20") the editor's preview hands the frame. */
export const SHEET_PREVIEW_BAR_ID = '00000000-0000-4000-8000-000000000001';
/** The name of the sample token of the preview. */
export const SHEET_PREVIEW_TOKEN_NAME = 'Exemplo';

const SAMPLE_BAR: TokenBarDto = {
  id: SHEET_PREVIEW_BAR_ID,
  position: 0,
  label: 'PV',
  current: 20,
  max: 20,
  temp: 0,
  color: 'ember',
  visibility: 'everyone',
  display: 'number',
};
const DICE_IN_PREVIEW = 'Prévia do editor: os dados só rolam na ficha de um token, na sala.';

type Preview = {
  port: SheetHostPort;
  values: SheetValuesDto;
  bar: TokenBarDto;
  ready: boolean;
  console: SheetConsoleSink;
};

export type SheetPreviewHost = Readonly<{ dispose: () => void }>;

export type SheetPreviewHostOptions = Readonly<{
  /** The frame's console lines, past the host's own rate limit. */
  onConsole?: SheetConsoleSink;
  now?: () => number;
}>;

/** Speaks for the frame of the template editor's preview: a sample token ("Exemplo", PV 20/20,
 *  `canEdit`), values and the bar kept only here, and no real command. A roll is answered with an
 *  error saying it is a preview; the frame's console goes to `onConsole`, never answered.
 *
 *  Example: `<SheetFrame onConnect={(port) => (host = createSheetPreviewHost(port, { onConsole }))} … />` */
export function createSheetPreviewHost(
  port: SheetHostPort,
  options: SheetPreviewHostOptions = {},
): SheetPreviewHost {
  const sink = options.onConsole ?? noConsole;
  const preview: Preview = {
    port,
    values: {},
    bar: SAMPLE_BAR,
    ready: false,
    console: createConsoleIntake(options.now ?? Date.now, sink),
  };
  const onMessage = (event: { data: unknown }): void => receive(preview, event.data);
  port.addEventListener('message', onMessage);
  port.start();
  return {
    dispose: () => {
      port.removeEventListener('message', onMessage);
      port.close();
    },
  };
}

function noConsole(): void {}

function receive(preview: Preview, data: unknown): void {
  const parsed = sheetFrameMessageDto.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return postError(preview, requestIdOf(data), 'INVALID_MESSAGE', message.slice(0, 500));
  }
  const request = parsed.data;
  if (request.type === 'console' || request.type === 'console.dropped')
    return preview.console(request);
  if (request.type === 'dice.roll')
    return postError(preview, request.requestId, 'PREVIEW_ONLY', DICE_IN_PREVIEW);
  const refusal = apply(preview, request);
  if (refusal) return postError(preview, request.requestId, refusal.code, refusal.message);
  // The state goes first, as in the room: once the promise settles, `values.get` sees the change.
  postState(preview);
  preview.port.postMessage({ type: 'result', requestId: request.requestId });
}

type Refusal = Readonly<{ code: string; message: string }> | null;

function apply(preview: Preview, request: SheetFrameRequestDto): Refusal {
  if (request.type === 'ready') preview.ready = true;
  if (request.type === 'values.set') preview.values = mergedValues(preview.values, request.changes);
  if (request.type !== 'bars.adjust') return null;
  const bar = resolveSheetBar([preview.bar], request.bar);
  if (!bar.ok) return { code: bar.code, message: bar.message };
  try {
    preview.bar = {
      ...preview.bar,
      ...adjustBarValues(preview.bar, request.change, BAR_VALUE_LIMIT),
    };
  } catch (error) {
    return { code: 'INVALID_MESSAGE', message: String(error).slice(0, 500) };
  }
  return null;
}

function mergedValues(values: SheetValuesDto, changes: SheetValuesDto): SheetValuesDto {
  const merged: Record<string, SheetValuesDto[string]> = { ...values };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

function postState(preview: Preview): void {
  if (!preview.ready) return;
  const state = sheetHostMessageDto.safeParse({
    type: 'state',
    token: { name: SHEET_PREVIEW_TOKEN_NAME, image: null },
    bars: [preview.bar],
    values: preview.values,
    canEdit: true,
  });
  if (state.success) preview.port.postMessage(state.data);
}

function postError(preview: Preview, requestId: string | null, code: string, message: string) {
  const error: SheetHostMessageDto = { type: 'error', requestId, code, message };
  preview.port.postMessage(error);
}

function requestIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('requestId' in data)) return null;
  const parsed = sheetBridgeRequestIdDto.safeParse(data.requestId);
  return parsed.success ? parsed.data : null;
}
