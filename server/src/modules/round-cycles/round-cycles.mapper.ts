import type {
  RoundCycleCombatDto,
  RoundCycleDto,
  RoundCycleHolderDto,
  RoundCyclePhaseInputDto,
  RoundCycleVisibilityDto,
} from '@lorkarium/contracts';
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

/** The cycles one viewer sees, as they may see them: `canChoose` theirs, the config only for a
 *  master, and where each stands in the table's combats.
 *
 *  Example: `roundCyclesSeenBy(rows, states, { kind: 'member', userId: lyraId })` */
export function roundCyclesSeenBy(
  rows: readonly RoundCycleRow[],
  states: readonly CombatCycleState[],
  viewer: CycleViewer,
): RoundCycleDto[] {
  return rows
    .filter((row) => RULES.sees(audienceOf(row), viewer))
    .map((row) => toRoundCycleDto(row, states, viewer));
}

/** Every audience's list after a change: the masters', each named member's, and the rest's.
 *
 *  Example: `publisher.roundCyclesChanged({ ...base, cuts: roundCycleCutsOf(rows, states) })` */
export function roundCycleCutsOf(
  rows: readonly RoundCycleRow[],
  states: readonly CombatCycleState[],
): RoundCycleCuts {
  const named = [...new Set(rows.flatMap(({ members }) => members.map(({ userId }) => userId)))];
  return {
    masters: roundCyclesSeenBy(rows, states, { kind: 'master' }),
    members: named.map((userId) => ({
      userId,
      cycles: roundCyclesSeenBy(rows, states, { kind: 'member', userId }),
    })),
    rest: roundCyclesSeenBy(rows, states, { kind: 'rest' }),
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
): RoundCycleDto {
  const { cycle } = row;
  return {
    id: cycle.id,
    name: cycle.name,
    announce: cycle.announce,
    phases: row.phases.map(({ id, name, imageAssetId }) => ({ id, name, imageAssetId })),
    canChoose: RULES.canChoose(audienceOf(row), viewer),
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
