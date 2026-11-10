import {
  SHEET_VALUE_PATCHES_MAX,
  applySheetValueEdits,
  type SheetChangedEventDto,
  type SheetDto,
  type SheetResponseDto,
  type SheetTemplateCodeDto,
  type SheetValueDto,
  type SheetValuePathPatchDto,
  type SheetValuesDto,
  type UpdateSheetValuesRequestDto,
} from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { SheetsApi, SheetsFailure } from '@/services/sheets-api';

export type SheetStatus = 'loading' | 'ready' | 'not_found' | 'failed';
/** `offline`: the last batch is kept, with its action id, and goes again on the next change. */
export type SheetSaveStatus = 'saved' | 'pending' | 'saving' | 'offline' | 'refused';
export type SheetValuesOutcome =
  Readonly<{ ok: true }> | Readonly<{ ok: false; failure: SheetsFailure }>;

export type SheetStoreState = Readonly<{
  status: SheetStatus;
  sheet: SheetDto | null;
  template: SheetTemplateCodeDto | null;
  /** The confirmed values with the unsent and in-flight changes over them (what the frame sees). */
  values: SheetValuesDto;
  saveStatus: SheetSaveStatus;
  load: () => Promise<void>;
  /** `sheet:changed`: a newer version of this sheet is read again by the route. */
  changed: (event: SheetChangedEventDto) => void;
  /** Queues changed keys (`null` removes one); they go together `SHEET_VALUES_BATCH_MS` after the
   *  first, and the promise settles with the patch that carried them. */
  setValues: (changes: SheetValuesDto) => Promise<SheetValuesOutcome>;
  /** Queues path patches (`null` removes the path) in the same batch as `setValues`: a patch
   *  under a key set in the batch folds into it, a key set later drops the patches under it, the
   *  same path again keeps the last. The patches come validated (`sheetValuePathPatchesDto`). */
  patchValues: (patches: readonly SheetValuePathPatchDto[]) => Promise<SheetValuesOutcome>;
  flush: () => Promise<void>;
  /** Sends what is queued without waiting, and no later answer touches the store again. */
  dispose: () => void;
}>;

export type SheetStoreOptions = Readonly<{
  api: SheetsApi;
  campaignId: string;
  sheetId: string;
  clock: InteractionClock;
  newActionId: () => string;
}>;

/** How long changes from the frame are gathered into one patch. */
export const SHEET_VALUES_BATCH_MS = 500;

type Changes = Record<string, SheetValueDto>;
type Waiter = (outcome: SheetValuesOutcome) => void;
type Batch = {
  actionId: string;
  changes: Changes;
  patches: SheetValuePathPatchDto[];
  waiters: Waiter[];
};
type Queue = {
  disposed: boolean;
  pending: Batch | null;
  sending: Batch | null;
  retry: Batch | null;
  inFlight: Promise<void> | null;
  cancelTimer: (() => void) | null;
};

const EMPTY_QUEUE: Queue = {
  disposed: false,
  pending: null,
  sending: null,
  retry: null,
  inFlight: null,
  cancelTimer: null,
};

/** The confirmed sheet one viewer reads, plus the values the frame changed and has not seen
 *  confirmed yet. The last write wins per key, so there is no conflict to suspend.
 *
 *  Example: `const sheet = createSheetStore(options); await sheet.getState().load()` */
export function createSheetStore(options: SheetStoreOptions): StoreApi<SheetStoreState> {
  const queue: Queue = { ...EMPTY_QUEUE };
  const store: StoreApi<SheetStoreState> = createStore<SheetStoreState>()(() => ({
    status: 'loading',
    sheet: null,
    template: null,
    values: {},
    saveStatus: 'saved',
    load: () => read(options, store, queue),
    changed: (event) => changed(options, store, queue, event),
    setValues: (changes) => queueEdit(options, store, queue, (batch) => setInto(batch, changes)),
    patchValues: (patches) =>
      queueEdit(options, store, queue, (batch) => patchInto(batch, patches)),
    flush: () => flush(options, store, queue),
    dispose: () => dispose(options, queue),
  }));
  return store;
}

async function read(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
): Promise<void> {
  const result = await options.api.detail(options.campaignId, options.sheetId);
  if (queue.disposed) return;
  if (result.ok) return adopt(store, queue, result.value);
  if (result.failure.kind === 'not_found') return goNotFound(store, queue);
  if (store.getState().status === 'loading') store.setState({ status: 'failed' });
}

function adopt(
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  response: Pick<SheetResponseDto, 'sheet'> & Partial<Pick<SheetResponseDto, 'template'>>,
): void {
  const { sheet, template } = store.getState();
  if (store.getState().status === 'not_found') return;
  const newer = sheet === null || response.sheet.version >= sheet.version;
  const nextTemplate =
    response.template && (template === null || response.template.version >= template.version)
      ? response.template
      : template;
  const nextSheet = newer ? response.sheet : sheet;
  store.setState({ status: 'ready', sheet: nextSheet, template: nextTemplate });
  refreshValues(store, queue);
}

function changed(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  event: SheetChangedEventDto,
): void {
  if (queue.disposed || event.campaignId !== options.campaignId) return;
  if (event.sheetId !== options.sheetId) return;
  const { sheet, status } = store.getState();
  if (status === 'not_found' || (sheet !== null && event.version <= sheet.version)) return;
  void read(options, store, queue);
}

function queueEdit(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  edit: (batch: Batch) => void,
): Promise<SheetValuesOutcome> {
  const { status, sheet } = store.getState();
  if (queue.disposed || status !== 'ready' || sheet === null) return refusal('not_found');
  if (!sheet.canEdit) return refusal('forbidden');
  return new Promise((resolve) => {
    const pending = (queue.pending ??= { actionId: '', changes: {}, patches: [], waiters: [] });
    pending.waiters.push(resolve);
    store.setState({ saveStatus: 'pending' });
    edit(pending);
    refreshValues(store, queue);
    if (pending.patches.length > SHEET_VALUE_PATCHES_MAX) foldPatches(store, pending);
    schedule(options, store, queue);
  });
}

// The server applies the changes before the patches: a key set now wins over earlier patches.
function setInto(batch: Batch, changes: SheetValuesDto): void {
  batch.changes = { ...batch.changes, ...changes };
  batch.patches = batch.patches.filter(({ path }) => !Object.hasOwn(changes, path[0] ?? ''));
}

function patchInto(batch: Batch, patches: readonly SheetValuePathPatchDto[]): void {
  for (const patch of patches) {
    const root = patch.path[0] ?? '';
    if (Object.hasOwn(batch.changes, root)) {
      batch.changes = { ...batch.changes, [root]: patchedKey(batch.changes, root, patch) };
      continue;
    }
    const samePath = (other: SheetValuePathPatchDto) =>
      other.path.join('/') === patch.path.join('/');
    batch.patches = [...batch.patches.filter((other) => !samePath(other)), patch];
  }
}

function patchedKey(changes: Changes, root: string, patch: SheetValuePathPatchDto): SheetValueDto {
  const value = changes[root];
  const base: SheetValuesDto = value === null || value === undefined ? {} : { [root]: value };
  return applySheetValueEdits(base, { patches: [patch] })[root] ?? null;
}

// Past the request's limit, each patched key goes whole, as the frame sees it now.
function foldPatches(store: StoreApi<SheetStoreState>, batch: Batch): void {
  const { values } = store.getState();
  const roots = new Set(batch.patches.map(({ path }) => path[0] ?? ''));
  for (const root of roots) batch.changes = { ...batch.changes, [root]: values[root] ?? null };
  batch.patches = [];
}

function schedule(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
): void {
  if (queue.cancelTimer !== null) return;
  queue.cancelTimer = options.clock.after(SHEET_VALUES_BATCH_MS, () => {
    queue.cancelTimer = null;
    void flush(options, store, queue);
  });
}

async function flush(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
): Promise<void> {
  queue.cancelTimer?.();
  queue.cancelTimer = null;
  while (queue.inFlight !== null) await queue.inFlight;
  if (queue.disposed) return;
  const batch = takeBatch(options, queue);
  if (batch === null) return;
  queue.inFlight = send(options, store, queue, batch).finally(() => {
    queue.inFlight = null;
  });
  await queue.inFlight;
  if (queue.pending !== null) schedule(options, store, queue);
}

// An uncertain batch goes first and alone, with its own action id: the server either has it
// (same receipt back) or applies it now; the newer changes follow in the next patch.
function takeBatch(options: SheetStoreOptions, queue: Queue): Batch | null {
  if (queue.retry !== null) {
    const retry = queue.retry;
    queue.retry = null;
    return retry;
  }
  const pending = queue.pending;
  queue.pending = null;
  if (pending === null) return null;
  return { ...pending, actionId: options.newActionId() };
}

async function send(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  batch: Batch,
): Promise<void> {
  queue.sending = batch;
  store.setState({ saveStatus: 'saving' });
  const input = requestOf(batch.actionId, batch);
  const result = await options.api.saveValues(options.campaignId, options.sheetId, input);
  queue.sending = null;
  if (queue.disposed) return;
  if (result.ok) {
    settle(batch, { ok: true });
    adopt(store, queue, result.value);
    return store.setState({ saveStatus: queue.pending === null ? 'saved' : 'pending' });
  }
  settle(batch, result);
  sendFailed(options, store, queue, batch, result.failure);
}

function sendFailed(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  batch: Batch,
  failure: SheetsFailure,
): void {
  if (failure.kind === 'not_found') return goNotFound(store, queue);
  if (failure.kind === 'offline' || failure.kind === 'unexpected') {
    queue.retry = { ...batch, waiters: [] };
    return store.setState({ saveStatus: 'offline' });
  }
  store.setState({ saveStatus: 'refused' });
  refreshValues(store, queue);
  void read(options, store, queue);
}

function goNotFound(store: StoreApi<SheetStoreState>, queue: Queue): void {
  queue.cancelTimer?.();
  queue.cancelTimer = null;
  if (queue.pending !== null) settle(queue.pending, { ok: false, failure: { kind: 'not_found' } });
  queue.pending = null;
  queue.retry = null;
  store.setState({ status: 'not_found', sheet: null, template: null, values: {} });
}

function dispose(options: SheetStoreOptions, queue: Queue): void {
  queue.cancelTimer?.();
  queue.cancelTimer = null;
  queue.disposed = true;
  for (const batch of [queue.retry, queue.pending]) {
    if (batch === null) continue;
    const input = requestOf(batch.actionId || options.newActionId(), batch);
    void options.api.saveValues(options.campaignId, options.sheetId, input);
    settle(batch, { ok: false, failure: { kind: 'not_found' } });
  }
  queue.retry = null;
  queue.pending = null;
}

// Only what the batch carries: the request refuses an empty `changes` or `patches`.
function requestOf(actionId: string, batch: Batch): UpdateSheetValuesRequestDto {
  const changes = Object.keys(batch.changes).length > 0 ? { changes: batch.changes } : {};
  const patches = batch.patches.length > 0 ? { patches: batch.patches } : {};
  return { actionId, ...changes, ...patches };
}

// The same merge the server makes, so what the frame sees is what will be confirmed.
function refreshValues(store: StoreApi<SheetStoreState>, queue: Queue): void {
  const confirmed = store.getState().sheet?.values ?? {};
  const layers = [queue.retry, queue.sending, queue.pending].filter((batch) => batch !== null);
  store.setState({
    values: layers.reduce((values, batch) => applySheetValueEdits(values, batch), confirmed),
  });
}

function settle(batch: Batch, outcome: SheetValuesOutcome): void {
  for (const waiter of batch.waiters.splice(0)) waiter(outcome);
}

function refusal(kind: SheetsFailure['kind']): Promise<SheetValuesOutcome> {
  return Promise.resolve({ ok: false, failure: { kind } });
}
