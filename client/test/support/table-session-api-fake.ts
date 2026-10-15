import { act } from '@testing-library/react';
import type {
  TableSessionApi,
  TableSessionHandle,
  TableSessionListener,
  TableSessionUpdate,
} from '@/services/table-session-api';

/** The live session as the test plays it: `opened` lists each table opened, `closed` counts
 *  `close()` calls, and `emit(update)` delivers an update to the latest listener inside `act`.
 *
 *  Example: `deps.tableSessionApi.emit({ kind: 'state', state: vharnState() })` */
export class TableSessionApiFake implements TableSessionApi {
  readonly opened: string[] = [];
  closed = 0;
  private listener: TableSessionListener | null = null;

  open(campaignId: string, listener: TableSessionListener): TableSessionHandle {
    this.opened.push(campaignId);
    this.listener = listener;
    return { close: () => void (this.closed += 1) };
  }

  emit(...updates: TableSessionUpdate[]): void {
    const listener = this.listener;
    if (!listener) throw new Error(`no table opened yet; cannot emit ${JSON.stringify(updates)}`);
    act(() => {
      for (const update of updates) listener(update);
    });
  }
}
