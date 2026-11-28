import type {
  PlanLimits,
  RoundCycleCombatDto,
  RoundCycleDto,
  RoundCycleHolderDto,
  RoundCyclePhaseInputDto,
  RoundCycleVisibilityDto,
} from '@lorkarium/contracts';
import { RoundCyclePlanBo } from './round-cycle-plan.bo';
import { RoundCycleRulesBo, type CycleViewer } from './round-cycle-rules.bo';
import type {
  CombatCycleState,
  RoundCycleMemberWrite,
  RoundCycleRow,
  RoundCycleWrite,
} from './round-cycles.dao';
import type { RoundCyclePo } from './round-cycles.po';

const RULES = new RoundCycleRulesBo();

/** The cycle fields of `cycle:define` / `cycle:update`. */
export type RoundCycleFields = Readonly<{
  name: string;
  holder: RoundCycleHolderDto;
  visibility: RoundCycleVisibilityDto;
  announce: boolean;
  phases: readonly RoundCyclePhaseInputDto[];
}>;

/** What every audience of the table receives of the cycles after one change. */
export type RoundCycleCuts = Readonly<{
  masters: RoundCycleDto[];
  /** One list per member named in some cycle (as seer or chooser). */
  members: ReadonlyArray<Readonly<{ userId: string; cycles: RoundCycleDto[] }>>;
  /** Everyone else: only what everybody sees. */
  rest: RoundCycleDto[];
}>;

/** The row a command writes; `members` comes from the rules (`membersOf`).
 *
 *  Example: `toRoundCycleWrite(command, rules.membersOf(command, players))` */
export function toRoundCycleWrite(
  fields: RoundCycleFields,
  members: readonly RoundCycleMemberWrite[],
): RoundCycleWrite {
  const { holder } = fields;
  return {
    name: fields.name,
    visibility: fields.visibility,
    announce: fields.announce,
    holderCharacterId: holder.kind === 'character' ? holder.characterId : null,
    holderTokenId: holder.kind === 'token' ? holder.tokenId : null,
    phases: fields.phases,
    members,
  };
}

/** The holder of a saved cycle, as the contract and the game-core name it.
 *
 *  Example: `holderOf(row.cycle) // { kind: 'character', characterId }` */
export function holderOf(cycle: RoundCyclePo): RoundCycleHolderDto {
  if (cycle.holderCharacterId) return { kind: 'character', characterId: cycle.holderCharacterId };
  if (cycle.holderTokenId) return { kind: 'token', tokenId: cycle.holderTokenId };
  return { kind: 'table' };
}

/** What every list of the cycles reads: the rows oldest first (their rank is their place), the
 *  combats of the table and the limits of its owner (`planLocked`). */
export type RoundCycleListing = Readonly<{
  rows: readonly RoundCycleRow[];
  states: readonly CombatCycleState[];
  limits: PlanLimits;
}>;

/** The cycles one viewer sees, as they may see them: `canChoose` theirs, the config only for a
 *  master, `planLocked` by the rank against the owner's plan, and where each stands in the
 *  table's combats.
 *
 *  Example: `roundCyclesSeenBy({ rows, states, limits }, { kind: 'member', userId: lyraId })` */
export function roundCyclesSeenBy(
  listing: RoundCycleListing,
  viewer: CycleViewer,
): RoundCycleDto[] {
  return listing.rows.flatMap((row, rank) => {
    if (!RULES.sees(audienceOf(row), viewer)) return [];
    const planLocked = RoundCyclePlanBo.isLocked(rank, listing.limits);
    return [toRoundCycleDto(row, listing.states, viewer, planLocked)];
  });
}

/** Every audience's list after a change: the masters', each named member's, and the rest's.
 *
 *  Example: `publisher.roundCyclesChanged({ ...base, cuts: roundCycleCutsOf({ rows, states, limits }) })` */
export function roundCycleCutsOf(listing: RoundCycleListing): RoundCycleCuts {
  const { rows } = listing;
  const named = [...new Set(rows.flatMap(({ members }) => members.map(({ userId }) => userId)))];
  return {
    masters: roundCyclesSeenBy(listing, { kind: 'master' }),
    members: named.map((userId) => ({
      userId,
      cycles: roundCyclesSeenBy(listing, { kind: 'member', userId }),
    })),
    rest: roundCyclesSeenBy(listing, { kind: 'rest' }),
  };
}

function audienceOf(row: RoundCycleRow): Readonly<{
  visibility: RoundCycleRow['cycle']['visibility'];
  members: readonly RoundCycleMemberWrite[];
}> {
  return { visibility: row.cycle.visibility, members: row.members };
}

function toRoundCycleDto(
  row: RoundCycleRow,
  states: readonly CombatCycleState[],
  viewer: CycleViewer,
  planLocked: boolean,
): RoundCycleDto {
  const { cycle } = row;
  return {
    id: cycle.id,
    name: cycle.name,
    announce: cycle.announce,
    phases: row.phases.map(({ id, name, icon, imageAssetId }) => ({
      id,
      name,
      icon,
      imageAssetId,
    })),
    canChoose: RULES.canChoose(audienceOf(row), viewer),
    planLocked,
    config: viewer.kind === 'master' ? configOf(row) : null,
    combats: states.filter(({ cycleId }) => cycleId === cycle.id).map(toCombatDto),
  };
}

function configOf(row: RoundCycleRow): NonNullable<RoundCycleDto['config']> {
  return {
    holder: holderOf(row.cycle),
    visibility: row.cycle.visibility,
    seerIds: row.members.filter(({ canSee }) => canSee).map(({ userId }) => userId),
    chooserIds: row.members.filter(({ canChoose }) => canChoose).map(({ userId }) => userId),
  };
}

function toCombatDto(state: CombatCycleState): RoundCycleCombatDto {
  const { sceneId, round, currentPhaseId, chosenPhaseId } = state;
  return { sceneId, round, currentPhaseId, chosenPhaseId };
}
