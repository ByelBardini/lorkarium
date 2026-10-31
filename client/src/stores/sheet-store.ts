import type {
  SheetChangedEventDto,
  SheetDto,
  SheetResponseDto,
  SheetTemplateCodeDto,
  SheetValueDto,
  SheetValuesDto,
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
type Batch = { actionId: string; changes: Changes; waiters: Waiter[] };
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
    setValues: (changes) => queueChanges(options, store, queue, changes),
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

function queueChanges(
  options: SheetStoreOptions,
  store: StoreApi<SheetStoreState>,
  queue: Queue,
  changes: SheetValuesDto,
): Promise<SheetValuesOutcome> {
  const { status, sheet } = store.getState();
  if (queue.disposed || status !== 'ready' || sheet === null) return refusal('not_found');
  if (!sheet.canEdit) return refusal('forbidden');
  return new Promise((resolve) => {
    const pending = (queue.pending ??= { actionId: '', changes: {}, waiters: [] });
    pending.changes = { ...pending.changes, ...changes };
    pending.waiters.push(resolve);
    store.setState({ saveStatus: 'pending' });
    refreshValues(store, queue);
    schedule(options, store, queue);
  });
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
  const input = { actionId: batch.actionId, changes: batch.changes };
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
    const actionId = batch.actionId || options.newActionId();
    const input = { actionId, changes: batch.changes };
    void options.api.saveValues(options.campaignId, options.sheetId, input);
    settle(batch, { ok: false, failure: { kind: 'not_found' } });
  }
  queue.retry = null;
  queue.pending = null;
}

function refreshValues(store: StoreApi<SheetStoreState>, queue: Queue): void {
  const confirmed = store.getState().sheet?.values ?? {};
  const layers = [queue.retry, queue.sending, queue.pending].filter((batch) => batch !== null);
  store.setState({
    values: layers.reduce((values, batch) => merged(values, batch.changes), confirmed),
  });
}

function merged(values: SheetValuesDto, changes: Changes): SheetValuesDto {
  const next: Changes = { ...values };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

function settle(batch: Batch, outcome: SheetValuesOutcome): void {
  for (const waiter of batch.waiters.splice(0)) waiter(outcome);
}

function refusal(kind: SheetsFailure['kind']): Promise<SheetValuesOutcome> {
  return Promise.resolve({ ok: false, failure: { kind } });
}
