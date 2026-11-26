import type {
  ChooseNextPhaseCommandDto,
  DefineRoundCycleCommandDto,
  DeleteRoundCycleCommandDto,
  RoundCycleDto,
  UpdateRoundCycleCommandDto,
} from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { CharactersDao } from '../characters/characters.dao';
import {
  charactersEventBase,
  inLockedCharacters,
  type CharactersLockDaos,
  type CharactersTransaction,
} from '../characters/locked-characters';
import { requireAssetsOf } from '../tokens/token-transaction';
import { RoundCycleRulesBo, type CycleViewer } from './round-cycle-rules.bo';
import type { RoundCyclePublisherPort } from './round-cycle-publisher.port';
import type { RoundCyclesDao, RoundCycleWrite } from './round-cycles.dao';
import {
  RoundCycleHolderNotFoundError,
  RoundCycleNotActiveError,
  RoundCycleNotFoundError,
  RoundCyclePhaseNotFoundError,
} from './round-cycles.error';
import {
  roundCycleCutsOf,
  roundCyclesSeenBy,
  toRoundCycleWrite,
  type RoundCycleFields,
} from './round-cycles.mapper';

type Envelope = 'actionId' | 'campaignId';
export type DefineRoundCycle = Omit<DefineRoundCycleCommandDto, Envelope>;
export type UpdateRoundCycle = Omit<UpdateRoundCycleCommandDto, Envelope>;
export type DeleteRoundCycle = Omit<DeleteRoundCycleCommandDto, Envelope>;
export type ChooseNextPhase = Omit<ChooseNextPhaseCommandDto, Envelope>;

/** What the cycles read to cut the list for each audience, in or out of a write. */
export type RoundCycleReadDaos = Readonly<{
  roundCycles: Pick<RoundCyclesDao, 'listOfCampaign' | 'combatStatesOfCampaign'>;
}>;

export type RoundCycleWriteDaos = CharactersLockDaos &
  Readonly<{
    characters: Pick<CharactersDao, 'lockVersion' | 'bumpVersion' | 'findInCampaign'>;
    roundCycles: RoundCycleReadDaos['roundCycles'] &
      Pick<
        RoundCyclesDao,
        | 'insertCycle'
        | 'replaceCycle'
        | 'deleteCycle'
        | 'findInCampaign'
        | 'countOfCampaign'
        | 'playerIdsOf'
        | 'looseTokenInCampaign'
        | 'setChosen'
      >;
    assets: Pick<AssetsDao, 'findManyInCampaign'>;
  }>;

export type RoundCycleTransactionRunner = CharactersTransaction<RoundCycleWriteDaos>;

export type RoundCyclesServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: RoundCycleTransactionRunner;
  publisher: RoundCyclePublisherPort;
  clock: ClockPort;
}>;

const RULES = new RoundCycleRulesBo();

/** The cycles one viewer sees, read in their own snapshot (the `character:sync`).
 *
 *  Example: `await roundCyclesFor(daos, campaignId, { kind: 'member', userId })` */
export async function roundCyclesFor(
  daos: RoundCycleReadDaos,
  campaignId: string,
  viewer: CycleViewer,
): Promise<RoundCycleDto[]> {
  const rows = await daos.roundCycles.listOfCampaign(campaignId);
  const states = await daos.roundCycles.combatStatesOfCampaign(campaignId);
  return roundCyclesSeenBy(rows, states, viewer);
}

/** The table's round cycles (spec §3.16). They ride the table stream (the characters' version):
 *  every write locks and bumps it whatever grid the command names, and after the commit each
 *  audience gets the whole list as it sees it.
 *
 *  Example: `await roundCycles.define(gmId, vharnId, { name: 'Fases da Lua', holder: { kind: 'table' }, visibility: 'everyone', seerIds: [], chooserIds: [], announce: false, phases })` */
export class RoundCyclesService {
  constructor(private readonly deps: RoundCyclesServiceDeps) {}

  /** The 21st cycle is ROUND_CYCLE_LIMIT; a holder, image or member from outside the table is
   *  refused before anything is written. */
  async define(userId: string, campaignId: string, command: DefineRoundCycle): Promise<number> {
    await this.requireMaster(userId, campaignId, 'create a round cycle');
    return this.write(campaignId, async (daos) => {
      RULES.requireRoom(campaignId, await daos.roundCycles.countOfCampaign(campaignId));
      const write = await writeOf(daos, campaignId, command);
      await daos.roundCycles.insertCycle(campaignId, write);
    });
  }

  /** The whole cycle replaces the saved one; a cycle of another table is ROUND_CYCLE_NOT_FOUND. */
  async update(userId: string, campaignId: string, command: UpdateRoundCycle): Promise<number> {
    await this.requireMaster(userId, campaignId, 'edit a round cycle');
    return this.write(campaignId, async (daos) => {
      const write = await writeOf(daos, campaignId, command);
      const saved = await daos.roundCycles.replaceCycle(campaignId, command.cycleId, write);
      if (!saved) throw new RoundCycleNotFoundError(campaignId, command.cycleId);
    });
  }

  /** It leaves every combat with it (the cascade). */
  async delete(userId: string, campaignId: string, command: DeleteRoundCycle): Promise<number> {
    await this.requireMaster(userId, campaignId, 'delete a round cycle');
    return this.write(campaignId, async (daos) => {
      const deleted = await daos.roundCycles.deleteCycle(campaignId, command.cycleId);
      if (!deleted) throw new RoundCycleNotFoundError(campaignId, command.cycleId);
    });
  }

  /** The phase of the next round in the combat of `sceneId` (`null` = follow the cycle), by the
   *  master or a chooser; a cycle that is not in that combat is ROUND_CYCLE_NOT_ACTIVE. */
  async chooseNext(
    userId: string,
    campaignId: string,
    command: ChooseNextPhase & Readonly<{ sceneId?: string | undefined }>,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { cycleId, phaseId } = command;
    return this.write(campaignId, async (daos) => {
      const row = await daos.roundCycles.findInCampaign(campaignId, cycleId);
      if (!row) throw new RoundCycleNotFoundError(campaignId, cycleId);
      const who = { campaignId, userId, isMaster: access.isMaster() };
      RULES.requireChooser(
        { visibility: row.cycle.visibility, members: row.members },
        who,
        cycleId,
      );
      if (phaseId !== null && !row.phases.some(({ id }) => id === phaseId)) {
        throw new RoundCyclePhaseNotFoundError(cycleId, phaseId);
      }
      const states = await daos.roundCycles.combatStatesOfCampaign(campaignId);
      const state = states.find((one) => one.cycleId === cycleId && matchesScene(one, command));
      if (!state) throw new RoundCycleNotActiveError(cycleId, command.sceneId ?? 'of the table');
      await daos.roundCycles.setChosen(state.combatId, cycleId, phaseId);
    });
  }

  private async requireMaster(userId: string, campaignId: string, action: string): Promise<void> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(action);
  }

  // Lock the table stream → change → bump → read every audience's list → commit → publish.
  private async write(
    campaignId: string,
    change: (daos: RoundCycleWriteDaos) => Promise<void>,
  ): Promise<number> {
    const saved = await inLockedCharacters(this.deps.transaction, campaignId, async ({ daos }) => {
      await change(daos);
      const rows = await daos.roundCycles.listOfCampaign(campaignId);
      const states = await daos.roundCycles.combatStatesOfCampaign(campaignId);
      return { value: roundCycleCutsOf(rows, states), changed: true };
    });
    const base = charactersEventBase(campaignId, saved.version, this.deps.clock);
    this.deps.publisher.roundCyclesChanged({ ...base, cuts: saved.value });
    return saved.version;
  }
}

// Without `sceneId` the command names the group grid; a cycle is in at most one combat of it.
function matchesScene(
  state: Readonly<{ sceneId: string }>,
  command: Readonly<{ sceneId?: string | undefined }>,
): boolean {
  return command.sceneId === undefined || state.sceneId === command.sceneId;
}

type CycleCommand = RoundCycleFields &
  Readonly<{ seerIds: readonly string[]; chooserIds: readonly string[] }>;

async function writeOf(
  daos: RoundCycleWriteDaos,
  campaignId: string,
  command: CycleCommand,
): Promise<RoundCycleWrite> {
  await requireHolderOf(daos, campaignId, command.holder);
  await requireAssetsOf(
    daos,
    campaignId,
    command.phases.map(({ imageAssetId }) => imageAssetId),
  );
  const players = new Set(await daos.roundCycles.playerIdsOf(campaignId));
  return toRoundCycleWrite(command, RULES.membersOf(command, players));
}

async function requireHolderOf(
  daos: RoundCycleWriteDaos,
  campaignId: string,
  holder: RoundCycleFields['holder'],
): Promise<void> {
  if (holder.kind === 'table') return;
  if (holder.kind === 'character') {
    if (await daos.characters.findInCampaign(campaignId, holder.characterId)) return;
    throw new RoundCycleHolderNotFoundError(campaignId, 'character', holder.characterId);
  }
  if (await daos.roundCycles.looseTokenInCampaign(campaignId, holder.tokenId)) return;
  throw new RoundCycleHolderNotFoundError(campaignId, 'token', holder.tokenId);
}
