import type { TokenDto, UserPlan } from '@lorkarium/contracts';
import { expect } from 'vitest';
import { envelope } from './live-table';
import type { Table } from './tables';

/** The ack of a board command the table's plan refused: `room` (past the ceiling on a new
 *  item) or `readOnly` (the settings of an item past the ceiling).
 *
 *  Example: `expect(ack).toEqual(planRefusal('tokenBars', 1, 'free', 'readOnly'))` */
export function planRefusal(
  resource: string,
  limit: number,
  plan: UserPlan = 'free',
  reason: 'room' | 'readOnly' = 'room',
): object {
  const planLimit = { resource, limit, plan, reason };
  return { ok: false, error: expect.objectContaining({ code: 'PLAN_LIMIT', planLimit }) };
}

/** `count` bars as `token:create` and `token:update` send them ("Barra 1", "Barra 2", …). */
export function barsOf(count: number): object[] {
  return Array.from({ length: count }, (_, index) => ({
    label: `Barra ${index + 1}`,
    current: 1,
    max: 1,
    color: 'gold',
    visibility: 'everyone',
  }));
}

/** `count` 1×1 forms without image, each with a new id ("Forma 1", "Forma 2", …). */
export function formsOf(count: number): object[] {
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Forma ${index + 1}`,
    imageAssetId: null,
    width: 1,
    height: 1,
    frame: 'square',
  }));
}

/** The bars of a token as a `token:update` sends them back unchanged (the stored settings).
 *
 *  Example: `updateOf(live.vharn, lyra.id, { bars: barInputsOf(lyra) })` */
export function barInputsOf(token: Pick<TokenDto, 'bars'>): object[] {
  return token.bars.map(({ label, current, max, temp, color, visibility, display }) => ({
    ...{ label, current, max, temp, color, visibility, display },
  }));
}

/** A `token:update` of Lyra on `table` with no bars; `overrides` set the rest.
 *
 *  Example: `await send(ana, 'token:update', updateOf(live.vharn, lyraId, { bars: barsOf(1) }))` */
export function updateOf(table: Table, tokenId: string, overrides: object = {}): object {
  const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
  return { ...envelope(table.id), tokenId, ...fields, controllerIds: [], bars: [], ...overrides };
}
