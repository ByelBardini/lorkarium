import { stableHash } from './stable-hash';

/** The ping colors, bright enough on the dark board: gold, steel, ember, moss, violet, rose, teal
 *  and bone. Numbers because the canvas cannot read CSS. */
export const PING_COLORS: readonly number[] = [
  0xe0b25c, 0x6fa8dc, 0xe0704f, 0x8cc084, 0xb39ddb, 0xe58fb4, 0x5cc8c0, 0xf0e6d2,
];

/** The color of a person's pings, the same on every screen and every ping, with no data saved.
 *
 *  Example: `pingColorOf(user.id) // 0x5cc8c0` */
export function pingColorOf(userId: string): number {
  return PING_COLORS[stableHash(userId) % PING_COLORS.length] ?? 0xe0b25c;
}
