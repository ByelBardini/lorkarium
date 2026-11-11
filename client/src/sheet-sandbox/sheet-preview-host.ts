import {
  BAR_VALUE_LIMIT,
  MAX_BARS_PER_TOKEN,
  applySheetValueEdits,
  sheetBridgeRequestIdDto,
  sheetFrameMessageDto,
  sheetHostMessageDto,
  type SheetBridgeResultValueDto,
  type SheetFrameImageDto,
  type SheetFrameRequestDto,
  type SheetHostMessageDto,
  type SheetManifestPermissionDto,
} from '@lorkarium/contracts';
import { adjustBarValues, barLabelKey, spendBars } from '@lorkarium/game-core';
import {
  previewBarIdOf,
  SAMPLE_SHEET_PREVIEW_DATA,
  type SheetPreviewData,
} from '@/lib/sheet-preview-data';
import { resolveSheetBar } from './resolve-sheet-bar';
import { admitted, type SheetRateStamps } from './sheet-bridge-answer';
import {
  isSheetDocumentRead,
  readSheetDocuments,
  type SheetDocumentRead,
  type SheetDocumentSources,
} from './sheet-bridge-documents';
import { SHEET_DOCUMENT_READ_RATE, type SheetHostPort } from './sheet-bridge-host';
import { createConsoleIntake, type SheetConsoleSink } from './sheet-console';
import { permissionRefusalOf } from './sheet-permissions';

export { SHEET_PREVIEW_BAR_ID, SHEET_PREVIEW_TOKEN_NAME } from '@/lib/sheet-preview-data';

const DICE_IN_PREVIEW = 'Prévia do editor: os dados só rolam na ficha de um token, na sala.';
const DOCUMENTS_IN_PREVIEW = 'Prévia sem mesa: os documentos só são lidos com a mesa aberta.';

/** Where the preview reads the table's public documents (only reads: nothing changes there). */
export type SheetPreviewDocumentPorts = Readonly<{
  sources: SheetDocumentSources;
  campaignId: string;
}>;

type Preview = {
  port: SheetHostPort;
  data: SheetPreviewData;
  onDataChange: (data: SheetPreviewData) => void;
  portrait: SheetFrameImageDto | null;
  images: Map<string, SheetFrameImageDto>;
  permissions: readonly SheetManifestPermissionDto[];
  newAssetId: () => string;
  ready: boolean;
  disposed: boolean;
  console: SheetConsoleSink;
  documents: SheetPreviewDocumentPorts | null;
  documentReads: SheetRateStamps;
  now: () => number;
};

export type SheetPreviewHost = Readonly<{
  /** New test data from the editor: the frame gets a new state (once ready); not echoed back. */
  setData: (data: SheetPreviewData) => void;
  dispose: () => void;
}>;

export type SheetPreviewHostOptions = Readonly<{
  /** The frame's console lines, past the host's own rate limit. */
  onConsole?: SheetConsoleSink;
  now?: () => number;
  /** What the draft's manifest declares: the preview refuses the rest, as the room does. */
  permissions?: readonly SheetManifestPermissionDto[];
  /** The id of an image the preview keeps for `assets.upload`. */
  newAssetId?: () => string;
  /** The character, bars and values the frame starts from (the sample without it). */
  data?: SheetPreviewData;
  /** The data after a request of the frame changed it (`values.*`, `bars.*`, `character.set`). */
  onDataChange?: (data: SheetPreviewData) => void;
  /** The real table's public documents for `documents.*`; without it they answer PREVIEW_ONLY. */
  documents?: SheetPreviewDocumentPorts;
}>;

/** Speaks for the frame of the template editor's preview: a token named as the test data's
 *  character (the sample: "Exemplo", PV 20/20, AC 10, DC 10), always `canEdit`, and the data, the
 *  portrait and the uploaded images kept only here; no real command. A roll is answered with an
 *  error saying it is a preview; document reads go to the real table (reading changes nothing);
 *  the frame's console goes to `onConsole`, never answered.
 *
 *  Example: `<SheetFrame onConnect={(port) => (host = createSheetPreviewHost(port, { onConsole, permissions }))} … />` */
export function createSheetPreviewHost(
  port: SheetHostPort,
  options: SheetPreviewHostOptions = {},
): SheetPreviewHost {
  const now = options.now ?? Date.now;
  const preview: Preview = {
    ...{ port, data: options.data ?? SAMPLE_SHEET_PREVIEW_DATA, portrait: null },
    onDataChange: options.onDataChange ?? noDataChange,
    ...{ images: new Map(), permissions: options.permissions ?? [], ready: false },
    newAssetId: options.newAssetId ?? (() => crypto.randomUUID()),
    console: createConsoleIntake(now, options.onConsole ?? noConsole),
    ...{ disposed: false, documents: options.documents ?? null, documentReads: { stamps: [] } },
    now,
  };
  const onMessage = (event: { data: unknown }): void => receive(preview, event.data);
  port.addEventListener('message', onMessage);
  port.start();
  return {
    setData: (data) => {
      if (data === preview.data) return;
      preview.data = data;
      postState(preview);
    },
    dispose: () => {
      preview.disposed = true;
      port.removeEventListener('message', onMessage);
      port.close();
    },
  };
}

function noConsole(): void {}
function noDataChange(): void {}

function receive(preview: Preview, data: unknown): void {
  const parsed = sheetFrameMessageDto.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return postError(preview, requestIdOf(data), 'INVALID_MESSAGE', message.slice(0, 500));
  }
  const request = parsed.data;
  if (request.type === 'console' || request.type === 'console.dropped')
    return preview.console(request);
  if (isSheetDocumentRead(request)) return void readDocuments(preview, request);
  const before = preview.data;
  const answer = answerOf(preview, request);
  if (!answer.ok) return postError(preview, request.requestId, answer.code, answer.message);
  // The state goes first, as in the room: once the promise settles, `values.get` sees the change.
  postState(preview);
  if (preview.data !== before) preview.onDataChange(preview.data);
  postResult(preview, request.requestId, answer);
}

function postResult(preview: Preview, requestId: string, answer: Answer & { ok: true }): void {
  const value = answer.value;
  preview.port.postMessage(
    value ? { type: 'result', requestId, value } : { type: 'result', requestId },
  );
}

async function readDocuments(preview: Preview, request: SheetDocumentRead): Promise<void> {
  const answer = await documentAnswerOf(preview, request);
  if (preview.disposed) return;
  if (!answer.ok) return postError(preview, request.requestId, answer.code, answer.message);
  postResult(preview, request.requestId, answer);
}

// The same manifest rule and pace as the room: the reads reach the real server.
async function documentAnswerOf(preview: Preview, request: SheetDocumentRead): Promise<Answer> {
  const undeclared = permissionRefusalOf(request.type, preview.permissions);
  if (undeclared) return { ok: false, ...undeclared };
  if (preview.documents === null)
    return { ok: false, code: 'PREVIEW_ONLY', message: DOCUMENTS_IN_PREVIEW };
  if (!admitted(preview.documentReads, preview.now(), SHEET_DOCUMENT_READ_RATE)) {
    const { limit, windowMs } = SHEET_DOCUMENT_READ_RATE;
    const message = `More than ${limit} ${request.type} in ${windowMs / 1000} s`;
    return { ok: false, code: 'RATE_LIMITED', message };
  }
  const { sources, campaignId } = preview.documents;
  return readSheetDocuments(sources, campaignId, request);
}

type Answer =
  | Readonly<{ ok: true; value?: SheetBridgeResultValueDto }>
  | Readonly<{ ok: false; code: string; message: string }>;
const DONE: Answer = { ok: true };

function answerOf(preview: Preview, request: SheetFrameRequestDto): Answer {
  const undeclared = permissionRefusalOf(request.type, preview.permissions);
  if (undeclared) return { ok: false, ...undeclared };
  if (request.type === 'dice.roll')
    return { ok: false, code: 'PREVIEW_ONLY', message: DICE_IN_PREVIEW };
  if (request.type === 'bars.adjust') return adjustBar(preview, request);
  if (request.type === 'bars.spend') return spend(preview, request);
  if (request.type === 'bars.create') return createBar(preview, request);
  if (request.type === 'assets.read') return readImage(preview, request.assetId);
  if (request.type === 'assets.upload') return keepImage(preview, request.image);
  return keep(preview, request);
}

// The requests that only keep what they got here.
function keep(preview: Preview, request: SheetFrameRequestDto): Answer {
  const { data } = preview;
  if (request.type === 'ready') preview.ready = true;
  if (request.type === 'values.set')
    preview.data = {
      ...data,
      values: applySheetValueEdits(data.values, { changes: request.changes }),
    };
  if (request.type === 'values.patch')
    preview.data = {
      ...data,
      values: applySheetValueEdits(data.values, { patches: request.patches }),
    };
  if (request.type === 'character.set')
    preview.data = { ...data, character: { ...data.character, ...request.changes } };
  if (request.type === 'character.setImage') preview.portrait = request.image;
  return DONE;
}

function keepImage(preview: Preview, image: SheetFrameImageDto): Answer {
  const assetId = preview.newAssetId();
  preview.images.set(assetId, image);
  return { ok: true, value: { assetId } };
}

function adjustBar(
  preview: Preview,
  request: Extract<SheetFrameRequestDto, { type: 'bars.adjust' }>,
): Answer {
  const { bars } = preview.data;
  const found = resolveSheetBar(bars, request.bar);
  if (!found.ok) return { ok: false, code: found.code, message: found.message };
  try {
    const adjusted = bars.map((bar) =>
      bar.id === found.barId
        ? { ...bar, ...adjustBarValues(bar, request.change, BAR_VALUE_LIMIT) }
        : bar,
    );
    preview.data = { ...preview.data, bars: adjusted };
  } catch (error) {
    return { ok: false, code: 'INVALID_MESSAGE', message: String(error).slice(0, 500) };
  }
  return DONE;
}

// The same all-or-nothing rule as the server's `sheet:spendBars`, on the test bars.
function spend(
  preview: Preview,
  request: Extract<SheetFrameRequestDto, { type: 'bars.spend' }>,
): Answer {
  const { bars } = preview.data;
  const costs: Array<{ barId: string; amount: number }> = [];
  for (const cost of request.costs) {
    const bar = resolveSheetBar(bars, cost.bar);
    if (!bar.ok) return { ok: false, code: bar.code, message: bar.message };
    costs.push({ barId: bar.barId, amount: cost.amount });
  }
  const spent = spendBars(bars, costs);
  if (!spent.ok) {
    const message = `Bar "${spent.bar}" has ${spent.has}; expected at least ${spent.needs}`;
    return { ok: false, code: 'INSUFFICIENT_BAR', message };
  }
  const paid = new Map(spent.spent.map((bar) => [bar.id, bar]));
  preview.data = { ...preview.data, bars: bars.map((bar) => paid.get(bar.id) ?? bar) };
  return DONE;
}

// As the server does: the bar under that label (no case or accents) answers its id; a new one
// starts full, after the others, up to the cap.
function createBar(
  preview: Preview,
  request: Extract<SheetFrameRequestDto, { type: 'bars.create' }>,
): Answer {
  const { bars } = preview.data;
  const { label, max, color } = request.bar;
  const found = bars.find((bar) => barLabelKey(bar.label) === barLabelKey(label));
  if (found) return { ok: true, value: { barId: found.id, created: false } };
  if (bars.length >= MAX_BARS_PER_TOKEN) {
    const message = `Bar "${label}" does not fit: the holder has ${MAX_BARS_PER_TOKEN} bars; expected fewer than ${MAX_BARS_PER_TOKEN}`;
    return { ok: false, code: 'BAR_LIMIT', message };
  }
  const position = bars.length;
  const bar = { id: previewBarIdOf(position), position, label, current: max, max, color };
  const added = { ...bar, temp: 0, visibility: 'everyone', display: 'number' } as const;
  preview.data = { ...preview.data, bars: [...bars, added] };
  return { ok: true, value: { barId: added.id, created: true } };
}

function readImage(preview: Preview, assetId: string): Answer {
  const image = preview.images.get(assetId);
  if (image) return { ok: true, value: image };
  const message = `assets.read: no image ${assetId} in the preview; send one by assets.upload`;
  return { ok: false, code: 'ASSET_NOT_FOUND', message };
}

function postState(preview: Preview): void {
  if (!preview.ready) return;
  const { character, bars, values } = preview.data;
  const state = sheetHostMessageDto.safeParse({
    type: 'state',
    token: { name: character.name, image: preview.portrait },
    ...{ bars, values, canEdit: true, character },
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
