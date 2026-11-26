import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import type { CyclePhaseView } from './round-cycle-view';

/** One cycle's phase in the announcement. */
export type AnnouncedPhase = Readonly<{
  cycleId: string;
  cycleName: string;
  phase: CyclePhaseView;
}>;

/** What the announcement of one new round shows: `key` tells one announcement from the next
 *  (a dismissed one stays dismissed, the next one shows). */
export type CycleAnnouncementView = Readonly<{
  key: string;
  round: number;
  items: readonly AnnouncedPhase[];
}>;

/** The last announcement, if it is about the grid shown; the cycles of one round come together.
 *
 *  Example: `announcementOn(state.announced, sceneId)?.items[0]?.phase.name // 'Lua Cheia'` */
export function announcementOn(
  announced: RoundCyclesAnnouncedDto | null,
  sceneId: string | null,
): CycleAnnouncementView | null {
  if (announced === null || announced.sceneId !== sceneId) return null;
  const items = announced.announcements.map(({ cycleId, cycleName, phase }) => ({
    cycleId,
    cycleName,
    // The phase id is not announced; the cycle's keeps each item apart.
    phase: { phaseId: cycleId, name: phase.name, imageAssetId: phase.imageAssetId },
  }));
  return { key: announced.at, round: announced.round, items };
}
