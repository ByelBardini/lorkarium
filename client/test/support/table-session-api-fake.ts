import { act } from '@testing-library/react';
import type {
  TableSessionApi,
  TableSessionHandle,
  TableSessionListener,
  TableSessionUpdate,
} from '@/services/table-session-api';
import { CallJournal } from './call-journal';

/** The live session as the test plays it: `opened` lists each table opened, `closedIds` each
 *  table closed (`closed` counts them), `emit(update)` delivers to the latest listener and
 *  `emitTo(campaignId, update)` to that table's, both inside `act`; `close` writes
 *  `close:<campaignId>` to the journal.
 *
 *  Example: `tableSessionApi.emitTo(VHARN.id, { kind: 'state', state: vharnState() })` */
export class TableSessionApiFake implements TableSessionApi {
  readonly opened: string[] = [];
  readonly closedIds: string[] = [];
  private listener: TableSessionListener | null = null;
  private readonly listeners = new Map<string, TableSessionListener>();

  constructor(private readonly journal: CallJournal = new CallJournal()) {}

  get closed(): number {
    return this.closedIds.length;
  }

  open(campaignId: string, listener: TableSessionListener): TableSessionHandle {
    this.opened.push(campaignId);
    this.listener = listener;
    this.listeners.set(campaignId, listener);
    return {
      close: () => {
        this.closedIds.push(campaignId);
        this.journal.entries.push(`close:${campaignId}`);
      },
    };
  }

  emitTo(campaignId: string, ...updates: TableSessionUpdate[]): void {
    const listener = this.listeners.get(campaignId);
    if (!listener) throw new Error(`table ${campaignId} was never opened; opened: ${this.opened}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }

  emit(...updates: TableSessionUpdate[]): void {
    const listener = this.listener;
    if (!listener) throw new Error(`no table opened yet; cannot emit ${JSON.stringify(updates)}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }
}
