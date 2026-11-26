/** A round cycle has 2 to 12 phases: one phase is not a cycle, and past 12 the badge stops
 *  being readable at a glance. */
export const ROUND_CYCLE_PHASES_MIN = 2;
export const ROUND_CYCLE_PHASES_MAX = 12;
/** Round cycles one table keeps. */
export const ROUND_CYCLES_PER_TABLE_MAX = 20;

/** Validates the phases of a round cycle, in order: 2 to 12, each one once.
 *
 *  Example: `roundCyclePhases(['nova', 'crescente', 'cheia', 'minguante'])` */
export function roundCyclePhases(phaseIds: readonly string[]): readonly string[] {
  const count = phaseIds.length;
  if (count < ROUND_CYCLE_PHASES_MIN || count > ROUND_CYCLE_PHASES_MAX) {
    throw new RangeError(
      `Round cycle got ${count} phases: expected ${ROUND_CYCLE_PHASES_MIN}–${ROUND_CYCLE_PHASES_MAX} phases.`,
    );
  }
  const repeated = phaseIds.find((id, index) => phaseIds.indexOf(id) !== index);
  if (repeated !== undefined) {
    throw new RangeError(
      `Round cycle phase ${repeated} appears more than once: expected distinct phase ids.`,
    );
  }
  return phaseIds;
}
