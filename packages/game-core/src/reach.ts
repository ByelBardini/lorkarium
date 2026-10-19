/** The longest bright or dim reach of sight or light, in cells (the widest scene). */
export const REACH_MAX = 100;

/** Refuses a bright or dim reach that is not a finite number from 0 to 100 cells, naming what
 *  reaches (`Sight`, `Light`) in the message.
 *
 *  Example: `assertReach('Light', 'bright', 101)` throws "Light bright 101 is invalid: expected 0 to 100 cells." */
export function assertReach(subject: string, side: 'bright' | 'dim', value: number): void {
  if (Number.isFinite(value) && value >= 0 && value <= REACH_MAX) return;
  throw new RangeError(
    `${subject} ${side} ${String(value)} is invalid: expected 0 to ${REACH_MAX} cells.`,
  );
}
