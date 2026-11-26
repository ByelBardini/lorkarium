import type {
  RoundCycleMemberWrite,
  RoundCycleRow,
} from '../../src/modules/round-cycles/round-cycles.dao';
import type { RoundCyclePo } from '../../src/modules/round-cycles/round-cycles.po';

type RoundCycleOverrides = Partial<RoundCyclePo> &
  Readonly<{ phaseNames?: readonly string[]; members?: readonly RoundCycleMemberWrite[] }>;

/** A saved round cycle of the table `campaign-1` with four phases (`<id>-phase-0` to 3) and no
 *  member, unless overridden.
 *
 *  Example: `roundCycleRow({ id: 'moon', visibility: 'some', members: [{ userId, canSee: true, canChoose: true }] })` */
export function roundCycleRow(overrides: RoundCycleOverrides = {}): RoundCycleRow {
  const {
    phaseNames = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'],
    members = [],
    ...rest
  } = overrides;
  const cycle: RoundCyclePo = {
    id: 'cycle-1',
    campaignId: 'campaign-1',
    name: 'Fases da Lua',
    visibility: 'everyone',
    announce: false,
    holderCharacterId: null,
    holderTokenId: null,
    createdAt: new Date('2026-11-25T12:00:00Z'),
    ...rest,
  };
  return {
    cycle,
    phases: phaseNames.map((name, position) => ({
      id: `${cycle.id}-phase-${position}`,
      cycleId: cycle.id,
      position,
      name,
      imageAssetId: null,
    })),
    members: members.map((member) => ({ cycleId: cycle.id, ...member })),
  };
}
