import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import type { TableEventBase } from '../characters/locked-characters';
import type { RoundCycleCuts } from './round-cycles.mapper';

/** One saved change of the table's round cycles: the version of the table stream it produced
 *  and what each audience sees of the whole list. */
export type RoundCyclesChange = TableEventBase & Readonly<{ cuts: RoundCycleCuts }>;

/** Sends the round cycles to the live table after the commit (spec §5.5): every member gets
 *  exactly one `cycle:listChanged` per version — the list they see, maybe without the cycle that
 *  changed — so their version never has a hole. The announcement goes to the whole grid. */
export interface RoundCyclePublisherPort {
  roundCyclesChanged(change: RoundCyclesChange): void;
  roundCyclesAnnounced(event: RoundCyclesAnnouncedDto): void;
}
