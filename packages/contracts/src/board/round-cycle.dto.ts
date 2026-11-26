import { z } from 'zod';
import { boardCommandShape, tableEventShape } from './board-event.dto';
import type { BoardCommandAckDto } from './board.dto';
import { firstRepeated } from './token-id-group.dto';

/** Round cycles a table may keep (the game-core `ROUND_CYCLES_PER_TABLE_MAX`): small lists, so
 *  every event carries the whole list cut. */
export const ROUND_CYCLE_MAX_PER_TABLE = 20;
/** The phases of one cycle (the game-core `ROUND_CYCLE_PHASES_MIN`/`MAX`). */
export const ROUND_CYCLE_PHASES_MIN = 2;
export const ROUND_CYCLE_PHASES_MAX = 12;
export const ROUND_CYCLE_NAME_MAX_LENGTH = 40;
export const ROUND_CYCLE_PHASE_NAME_MAX_LENGTH = 32;
/** Members named in a cycle's seers or choosers (a table never seats more). */
export const ROUND_CYCLE_MEMBERS_MAX = 64;

/** Whose the cycle is: the table (every combat), a character (NPC too) or a loose token. */
export const roundCycleHolderDto = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('table') }),
  z.strictObject({ kind: z.literal('character'), characterId: z.uuid() }),
  z.strictObject({ kind: z.literal('token'), tokenId: z.uuid() }),
]);
export type RoundCycleHolderDto = z.infer<typeof roundCycleHolderDto>;

/** Who sees the cycle: everyone, the members in `seerIds` (and the masters) or the masters. */
export const roundCycleVisibilityDto = z.enum(['everyone', 'some', 'masters']);
export type RoundCycleVisibilityDto = z.infer<typeof roundCycleVisibilityDto>;

const cycleNameDto = z.string().trim().min(1).max(ROUND_CYCLE_NAME_MAX_LENGTH);
const phaseNameDto = z.string().trim().min(1).max(ROUND_CYCLE_PHASE_NAME_MAX_LENGTH);
const memberIdsDto = z.array(z.uuid()).max(ROUND_CYCLE_MEMBERS_MAX);

/** A phase as the master writes it: `id` keeps a phase already saved (and where a combat is on
 *  it); without `id` it is new. `imageAssetId` is an image of the table (`null` = the name only). */
export const roundCyclePhaseInputDto = z.strictObject({
  id: z.uuid().optional(),
  name: phaseNameDto,
  imageAssetId: z.uuid().nullable(),
});
export type RoundCyclePhaseInputDto = z.infer<typeof roundCyclePhaseInputDto>;

const roundCycleFieldsShape = {
  name: cycleNameDto,
  holder: roundCycleHolderDto,
  visibility: roundCycleVisibilityDto,
  seerIds: memberIdsDto,
  chooserIds: memberIdsDto,
  /** The phase goes to everyone in the grid at each turn, even to who does not see the cycle. */
  announce: z.boolean(),
  phases: z.array(roundCyclePhaseInputDto).min(ROUND_CYCLE_PHASES_MIN).max(ROUND_CYCLE_PHASES_MAX),
};

type RoundCycleFields = Readonly<{
  visibility: RoundCycleVisibilityDto;
  seerIds: readonly string[];
  chooserIds: readonly string[];
  phases: readonly Readonly<{ id?: string | undefined }>[];
}>;

function checkRoundCycleFields(fields: RoundCycleFields, context: z.RefinementCtx): void {
  if (fields.visibility !== 'some' && fields.seerIds.length > 0) {
    context.addIssue({
      code: 'custom',
      message: `seerIds only with visibility some; got visibility ${fields.visibility} with ${fields.seerIds.length} seers`,
    });
  }
  if (fields.visibility === 'some' && fields.seerIds.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'visibility some needs at least one seer; got []',
    });
  }
  const phaseIds = fields.phases.flatMap(({ id }) => (id === undefined ? [] : [id]));
  for (const [label, ids] of [
    ['seerIds', fields.seerIds],
    ['chooserIds', fields.chooserIds],
    ['phases', phaseIds],
  ] as const) {
    const repeated = firstRepeated(ids);
    if (repeated === undefined) continue;
    context.addIssue({
      code: 'custom',
      message: `${label} has ${repeated} more than once; expected distinct ids`,
    });
  }
}

/** `cycle:define` (master): a new round cycle of the table.
 *
 *  Example: `defineRoundCycleCommandDto.parse({ actionId, campaignId, name: 'Fases da Lua', holder: { kind: 'table' }, visibility: 'everyone', seerIds: [], chooserIds: [], announce: false, phases })` */
export const defineRoundCycleCommandDto = z
  .strictObject({ ...boardCommandShape, ...roundCycleFieldsShape })
  .superRefine(checkRoundCycleFields);
export type DefineRoundCycleCommandDto = z.infer<typeof defineRoundCycleCommandDto>;

/** `cycle:update` (master): the whole cycle replaces the one saved; a phase that left with its
 *  id is deleted (a combat on it restarts at the first phase at the next turn).
 *
 *  Example: `updateRoundCycleCommandDto.parse({ ...fields, actionId, campaignId, cycleId })` */
export const updateRoundCycleCommandDto = z
  .strictObject({ ...boardCommandShape, cycleId: z.uuid(), ...roundCycleFieldsShape })
  .superRefine(checkRoundCycleFields);
export type UpdateRoundCycleCommandDto = z.infer<typeof updateRoundCycleCommandDto>;

/** `cycle:delete` (master).
 *
 *  Example: `deleteRoundCycleCommandDto.parse({ actionId, campaignId, cycleId })` */
export const deleteRoundCycleCommandDto = z.strictObject({
  ...boardCommandShape,
  cycleId: z.uuid(),
});
export type DeleteRoundCycleCommandDto = z.infer<typeof deleteRoundCycleCommandDto>;

/** `cycle:chooseNext` (master or a chooser of the cycle): the phase of the next round in the
 *  combat of `sceneId`; `null` = follow the cycle. `phaseId` is required: absent is not `null`.
 *
 *  Example: `chooseNextPhaseCommandDto.parse({ actionId, campaignId, sceneId, cycleId, phaseId })` */
export const chooseNextPhaseCommandDto = z.strictObject({
  ...boardCommandShape,
  cycleId: z.uuid(),
  phaseId: z.uuid().nullable(),
});
export type ChooseNextPhaseCommandDto = z.infer<typeof chooseNextPhaseCommandDto>;

export const roundCyclePhaseDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  imageAssetId: z.uuid().nullable(),
});
export type RoundCyclePhaseDto = z.infer<typeof roundCyclePhaseDto>;

/** How the cycle is set up; only the masters receive it (it names who sees and the holder,
 *  which may be a hidden token). */
export const roundCycleConfigDto = z.strictObject({
  holder: roundCycleHolderDto,
  visibility: roundCycleVisibilityDto,
  seerIds: z.array(z.uuid()),
  chooserIds: z.array(z.uuid()),
});
export type RoundCycleConfigDto = z.infer<typeof roundCycleConfigDto>;

/** Where the cycle stands in the combat of one grid. */
export const roundCycleCombatDto = z.strictObject({
  sceneId: z.uuid(),
  round: z.number().int().min(1),
  currentPhaseId: z.uuid().nullable(),
  chosenPhaseId: z.uuid().nullable(),
});
export type RoundCycleCombatDto = z.infer<typeof roundCycleCombatDto>;

/** A cycle as one member sees it: `canChoose` is theirs; `config` only for the masters. */
export const roundCycleDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  announce: z.boolean(),
  phases: z.array(roundCyclePhaseDto),
  canChoose: z.boolean(),
  config: roundCycleConfigDto.nullable(),
  combats: z.array(roundCycleCombatDto),
});
export type RoundCycleDto = z.infer<typeof roundCycleDto>;

/** `cycle:listChanged`: every cycle this member sees, after a change in the table stream. Who
 *  does not see the changed cycle gets the list without it, in the same version (§5.5). */
export const roundCyclesChangedDto = z.strictObject({
  ...tableEventShape,
  cycles: z.array(roundCycleDto).max(ROUND_CYCLE_MAX_PER_TABLE),
});
export type RoundCyclesChangedDto = z.infer<typeof roundCyclesChangedDto>;

/** One phase announced to the grid. */
export const roundCycleAnnouncementDto = z.strictObject({
  cycleId: z.uuid(),
  cycleName: z.string(),
  phase: z.strictObject({ name: z.string(), imageAssetId: z.uuid().nullable() }),
});
export type RoundCycleAnnouncementDto = z.infer<typeof roundCycleAnnouncementDto>;

/** `cycle:announced`: the phases that start the round, to everyone in the grid, ephemeral (no
 *  version, like a ping). */
export const roundCyclesAnnouncedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid(),
  round: z.number().int().min(1),
  at: z.iso.datetime(),
  announcements: z.array(roundCycleAnnouncementDto).min(1).max(ROUND_CYCLE_MAX_PER_TABLE),
});
export type RoundCyclesAnnouncedDto = z.infer<typeof roundCyclesAnnouncedDto>;

type CycleAck = (answer: BoardCommandAckDto) => void;

/** Client → server commands of the round cycles, merged into `BoardClientEvents`. */
export type RoundCycleClientEvents = {
  'cycle:define': (command: DefineRoundCycleCommandDto, ack: CycleAck) => void;
  'cycle:update': (command: UpdateRoundCycleCommandDto, ack: CycleAck) => void;
  'cycle:delete': (command: DeleteRoundCycleCommandDto, ack: CycleAck) => void;
  'cycle:chooseNext': (command: ChooseNextPhaseCommandDto, ack: CycleAck) => void;
};

/** Server → room events of the round cycles, merged into `BoardServerEvents`. */
export type RoundCycleServerEvents = {
  'cycle:listChanged': (event: RoundCyclesChangedDto) => void;
  'cycle:announced': (event: RoundCyclesAnnouncedDto) => void;
};
