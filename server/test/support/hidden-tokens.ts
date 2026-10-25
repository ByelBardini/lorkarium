import { eq, inArray } from 'drizzle-orm';
import { expect } from 'vitest';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { send } from './live-table';
import { recordEventsOf, type EventRecorder } from './realtime-client';
import { createdTokenOf, tokenCommandFor, type TokenTableHarness } from './token-table';

/** The Vharn table of a hidden-token spec: the three at the table, recording, and the tokens. */
export type HiddenTable = Readonly<{
  ana: EventRecorder;
  bia: EventRecorder;
  caio: EventRecorder;
  /** Bia's wolf, 2×2 at (3, 4) with a lit torch (4/4): its center is (4, 5). */
  loboId: string;
  /** Caio's ally at (7, 4), visible. */
  kaelId: string;
}>;

/** Ana, Bia and Caio at Vharn, with the Lobo (Bia) and the Kael (Caio) created by Ana; the Lobo
 *  already hidden by SQL when `hideLobo` (the command comes in its own spec). The recorders start
 *  empty, after the setup.
 *
 *  Example: `const table = await hiddenTable(live); await send(table.ana.client, 'token:move', …)` */
export async function hiddenTable(live: TokenTableHarness, hideLobo = true): Promise<HiddenTable> {
  const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
  const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
  const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
  const torch = { width: 2, height: 2, light: { bright: 4, dim: 4, color: 'torch' }, name: 'Lobo' };
  const loboId = await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id, torch));
  const kaelId = await createdBy(
    ana,
    tokenCommandFor(live.vharn, live.caio.id, { col: 7, name: 'Kael' }),
  );
  if (hideLobo) await hideBySql(live, [loboId]);
  const fresh = (recorder: EventRecorder): EventRecorder => recordEventsOf(recorder.client);
  return { ana: fresh(ana), bia: fresh(bia), caio: fresh(caio), loboId, kaelId };
}

/** Hides tokens straight in the database, as if `token:setHiddenMany` had run. */
export async function hideBySql(live: TokenTableHarness, ids: readonly string[]): Promise<void> {
  await live.connection.db
    .update(tokens)
    .set({ hidden: true })
    .where(inArray(tokens.id, [...ids]));
}

/** Whether a token is hidden in the database. */
export async function isHidden(live: TokenTableHarness, tokenId: string): Promise<boolean> {
  const [row] = await live.connection.db
    .select({ hidden: tokens.hidden })
    .from(tokens)
    .where(eq(tokens.id, tokenId));
  return row?.hidden ?? false;
}

/** The assertion that bites every leak: not one payload `recorder` got names `tokenId`.
 *
 *  Example: `expectNoTrace(table.caio, table.loboId)` */
export function expectNoTrace(recorder: EventRecorder, tokenId: string): void {
  expect(JSON.stringify(recorder.events)).not.toContain(tokenId);
}

/** The names of the events the recorder got, in order. */
export function namesOf(recorder: EventRecorder): string[] {
  return recorder.events.map(({ name }) => name);
}

async function createdBy(master: EventRecorder, command: object): Promise<string> {
  const before = master.events.length;
  await send(master.client, 'token:create', command);
  const recorder = {
    ...master,
    get events() {
      return master.events.slice(before);
    },
  };
  return (await createdTokenOf(recorder)).id;
}
