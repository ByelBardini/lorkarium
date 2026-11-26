import type { RoundCycleAnnouncementDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import { charactersEventBase } from '../characters/locked-characters';
import { planCombatCycles, type CombatMoment, type CycleInCombat } from './combat-cycles.bo';
import type { RoundCyclePublisherPort } from './round-cycle-publisher.port';
import type { RoundCycleRow, RoundCyclesDao } from './round-cycles.dao';
import { holderOf, roundCycleCutsOf, type RoundCycleCuts } from './round-cycles.mapper';

/** What a combat command reads and writes of the cycles, inside its own transaction. */
export type CombatCycleDaos = Readonly<{
  roundCycles: Pick<
    RoundCyclesDao,
    | 'countOfCampaign'
    | 'listOfCampaign'
    | 'combatStatesOfCampaign'
    | 'startCycles'
    | 'removeCycles'
    | 'turnAll'
  >;
}>;

/** The tokens of the combat after the command, and which character each wears. */
export type CombatHolders = ReadonlyArray<
  Readonly<{ tokenId: string; characterId: string | null }>
>;

export type CombatCyclesSync = Readonly<{
  campaignId: string;
  combatId: string;
  /** The round the combat is in after the command (the announced round). */
  round: number;
  holders: CombatHolders;
  moment: CombatMoment;
  /** Called before the first cycle write: the table stream gets locked (a rerun) if it was not. */
  requireTableLock: () => void;
}>;

/** What the cycles of the combat became: every audience's list and the phases announced. */
export type CombatCyclesSynced = Readonly<{
  cuts: RoundCycleCuts;
  round: number;
  announced: RoundCycleAnnouncementDto[];
}>;

/** Brings the cycles of one combat in line with it after a combat command (spec §3.16): those
 *  that play enter, those whose holder left go, and a new round turns them. Nothing to change →
 *  `null`, and the table stream is never locked; any change needs its lock, so the command bumps
 *  that version too.
 *
 *  Example: `const cycles = await syncCombatCycles(daos, { campaignId, combatId, round, holders, moment: 'round', requireTableLock })` */
export async function syncCombatCycles(
  daos: CombatCycleDaos,
  sync: CombatCyclesSync,
): Promise<CombatCyclesSynced | null> {
  const rows = await daos.roundCycles.listOfCampaign(sync.campaignId);
  const states = await daos.roundCycles.combatStatesOfCampaign(sync.campaignId);
  const mine = states.filter(({ combatId }) => combatId === sync.combatId);
  if (rows.length === 0 && mine.length === 0) return null;
  const plan = planCombatCycles({
    cycles: rows.map(toCycleInCombat),
    states: mine,
    present: presentOf(sync.holders),
    moment: sync.moment,
  });
  if (!plan.changed) return null;
  sync.requireTableLock();
  await daos.roundCycles.removeCycles(sync.combatId, plan.remove);
  await daos.roundCycles.startCycles(sync.combatId, plan.start);
  await daos.roundCycles.turnAll(sync.combatId, plan.turn);
  const after = await daos.roundCycles.combatStatesOfCampaign(sync.campaignId);
  return { cuts: roundCycleCutsOf(rows, after), round: sync.round, announced: plan.announced };
}

/** Whether the table keeps any cycle: a combat command of such a table locks the table stream
 *  before its first write, so bringing the cycles in line never reruns the command.
 *
 *  Example: `if (await tableHasCycles(daos, campaignId)) requireCharactersLock(locked)` */
export async function tableHasCycles(daos: CombatCycleDaos, campaignId: string): Promise<boolean> {
  return (await daos.roundCycles.countOfCampaign(campaignId)) > 0;
}

export type CombatCyclesOutlet = Readonly<{ publisher: RoundCyclePublisherPort; clock: ClockPort }>;

/** After the commit: the cycles' list in the table stream's `version`, then the announcement to
 *  the grid. Nothing synced or no version → nothing.
 *
 *  Example: `publishCombatCycles(outlet, { campaignId, sceneId }, saved.characters, synced)` */
export function publishCombatCycles(
  outlet: CombatCyclesOutlet,
  where: Readonly<{ campaignId: string; sceneId: string }>,
  version: number | null,
  synced: CombatCyclesSynced | null,
): void {
  if (version === null || synced === null) return;
  const base = charactersEventBase(where.campaignId, version, outlet.clock);
  outlet.publisher.roundCyclesChanged({ ...base, cuts: synced.cuts });
  if (synced.announced.length === 0) return;
  const { announced: announcements, round } = synced;
  outlet.publisher.roundCyclesAnnounced({ ...where, round, at: base.at, announcements });
}

function toCycleInCombat(row: RoundCycleRow): CycleInCombat {
  const { id, name, announce } = row.cycle;
  const phases = row.phases.map(({ id: phaseId, name: phaseName, imageAssetId }) => ({
    id: phaseId,
    name: phaseName,
    imageAssetId,
  }));
  return { id, name, announce, holder: holderOf(row.cycle), phases };
}

function presentOf(holders: CombatHolders): Readonly<{
  characterIds: ReadonlySet<string>;
  tokenIds: ReadonlySet<string>;
}> {
  const characterIds = holders.flatMap(({ characterId }) => characterId ?? []);
  const tokenIds = holders
    .filter(({ characterId }) => characterId === null)
    .map(({ tokenId }) => tokenId);
  return { characterIds: new Set(characterIds), tokenIds: new Set(tokenIds) };
}
