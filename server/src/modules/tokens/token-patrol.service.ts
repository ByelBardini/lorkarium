import type {
  SetTokenPatrolCommandDto,
  SetTokenPatrolsActiveCommandDto,
  TokenPatrolsChangedDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort, GridEvent } from '../scenes/board-publisher.port';
import {
  inLockedGrid,
  reachedGridOf,
  type GridAddress,
  type LockedGrid,
  type SavedVersion,
} from '../scenes/locked-scene';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import type { AddressedSceneRow } from '../scenes/scenes.dao';
import { TokenPatrolBo, type PatrolWrite } from './token-patrol.bo';
import {
  toPatrolChangeDto,
  toPatrolPausePo,
  toPatrolledToken,
  toTokenPatrol,
  toTokenPatrolPo,
  withPatrolWrite,
} from './token-patrol.mapper';
import {
  tokenIn,
  tokensIn,
  type TokenTransactionRunner,
  type TokenWriteDaos,
} from './token-transaction';
import { publishVeiledLights, veiledWriteOf, type VeiledWrite } from './token-veil';
import { cutsOf, entriesSeenBy } from './token-veil.mapper';
import type { TokenRow } from './tokens.dao';

type Envelope = 'actionId' | 'campaignId';
export type SetTokenPatrol = Omit<SetTokenPatrolCommandDto, Envelope>;
export type SetTokenPatrolsActive = Omit<SetTokenPatrolsActiveCommandDto, Envelope>;

export type TokenPatrolServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `TOKEN_PATROLS_RUNNING_MAX`, handed to the rule. */
  runningLimit: number;
}>;

/** What a patrol command saved: one write per token that changed, and its veil. */
type PatrolsSaved = Readonly<{ writes: readonly PatrolWrite[]; veiled: VeiledWrite }>;
type Locked = LockedGrid<TokenWriteDaos>;

/** The master's patrols (spec §3.9), on the grid the command names: the route of one token, and
 *  starting or pausing them in a group. The server keeps only the timeline (`started_at`, `step`);
 *  every screen derives the cell of now from it, so nothing here moves a token with time. `now`
 *  is read once per command: it starts the patrols and stamps the event.
 *
 *  Example: `await patrols.setActiveMany(ana.id, campaignId, { tokenIds: [kaelId], active: true })` */
export class TokenPatrolService {
  constructor(private readonly deps: TokenPatrolServiceDeps) {}

  /** Saves the route (or takes it away, `patrol: null`) of one token; saving over a running
   *  patrol restarts it from the first point, from where the token is now. */
  async setPatrol(userId: string, campaignId: string, command: SetTokenPatrol): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(`set a token patrol on token ${command.tokenId}`);
    const now = this.deps.clock.now();
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGrid(this.deps.transaction, address, async ({ daos, scene }) => {
      const row = await tokenIn(daos, scene, campaignId, command.tokenId);
      const token = toPatrolledToken(row);
      const bo = this.ruleOf(scene);
      const write = command.patrol
        ? bo.save(token, toTokenPatrol(row.token.id, command.patrol), now)
        : bo.remove(token, now);
      await writeRoute(daos, scene.id, row, write);
      return {
        writes: [write],
        veiled: await veiledWriteOf(daos, scene.id, [withPatrolWrite(row, write)]),
      };
    });
    this.publish(campaignId, saved, saved.value, now);
    return saved.version;
  }

  /** Starts or pauses the patrols of 1 to 64 tokens, all or nothing (TOKEN_PATROL_NOT_FOUND,
   *  OUT_OF_SCENE, TOKEN_PATROL_LIMIT). When none changes, the current version comes back with no
   *  bump and no event. */
  async setActiveMany(
    userId: string,
    campaignId: string,
    command: SetTokenPatrolsActive,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('start or pause token patrols');
    const now = this.deps.clock.now();
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await this.inGrid(address, (locked) => this.switchIn(locked, command, now));
    if (saved.value) this.publish(campaignId, saved.grid, saved.value, now);
    return saved.grid.version;
  }

  // The grid alone, bumped only when a patrol changed (like hiding tokens).
  private inGrid(
    address: GridAddress,
    work: (locked: Locked) => Promise<PatrolsSaved | null>,
  ): Promise<Readonly<{ value: PatrolsSaved | null; grid: SavedVersion }>> {
    return this.deps.transaction(async (daos) => {
      const row = await daos.scenes.lockInCampaign(address.campaignId, address.sceneId);
      const scene = reachedGridOf(address, row);
      const value = await work({ daos, scene });
      const version = value ? await daos.scenes.bumpVersion(scene.id) : scene.version;
      return { value, grid: { sceneId: scene.id, version } };
    });
  }

  private async switchIn(
    { daos, scene }: Locked,
    { tokenIds, active }: SetTokenPatrolsActive,
    now: Date,
  ): Promise<PatrolsSaved | null> {
    const rows = await tokensIn(daos, scene, scene.campaignId, tokenIds);
    const tokens = rows.map(toPatrolledToken);
    const bo = this.ruleOf(scene);
    const writes = active
      ? bo.start(tokens, await daos.tokens.patrols.countRunningOfScene(scene.id), now)
      : bo.pause(tokens, now);
    if (writes.length === 0) return null;
    const ids = writes.map(({ tokenId }) => tokenId);
    if (active) await daos.tokens.patrols.start(scene.id, ids, now);
    else await daos.tokens.patrols.pause(scene.id, writes.map(toPatrolPausePo));
    return { writes, veiled: await veiledWriteOf(daos, scene.id, writtenRowsOf(rows, writes)) };
  }

  // The table's plan comes with the grid lock: its owner's, never a cached one.
  private ruleOf(scene: AddressedSceneRow): TokenPatrolBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    const plan = effectiveLimitsOf(scene.owner);
    return new TokenPatrolBo({ scene: sceneSize, runningLimit: this.deps.runningLimit, plan });
  }

  private publish(campaignId: string, grid: SavedVersion, saved: PatrolsSaved, now: Date): void {
    const { sceneId, version } = grid;
    const at = now.toISOString();
    const changes = saved.writes.map(toPatrolChangeDto);
    const event: GridEvent<TokenPatrolsChangedDto> = { campaignId, sceneId, version, at, changes };
    this.deps.publisher.tokenPatrolsChanged(
      event,
      cutsOf(event, saved.veiled.veil, CHANGES_SEEN_BY),
    );
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, saved.veiled.lights);
  }
}

const CHANGES_SEEN_BY = entriesSeenBy<GridEvent<TokenPatrolsChangedDto>>('changes');

// A running patrol first stops where the token is now (its pose saved), then the route changes.
async function writeRoute(
  daos: TokenWriteDaos,
  sceneId: string,
  before: TokenRow,
  write: PatrolWrite,
): Promise<void> {
  const { tokenId, pose } = write;
  const { col, row, facing } = before.token;
  const moved = pose.col !== col || pose.row !== row || pose.facing !== facing;
  if (moved) await daos.tokens.patrols.place(sceneId, [{ tokenId, ...pose }]);
  if (write.timeline)
    await daos.tokens.patrols.save(sceneId, toTokenPatrolPo(tokenId, write.timeline));
  else await daos.tokens.patrols.remove(sceneId, tokenId);
}

// The rows as the writes left them (a hidden token's veiled light walks with its patrol).
function writtenRowsOf(rows: readonly TokenRow[], writes: readonly PatrolWrite[]): TokenRow[] {
  const byId = new Map(writes.map((write) => [write.tokenId, write]));
  return rows.flatMap((row) => {
    const write = byId.get(row.token.id);
    return write ? [withPatrolWrite(row, write)] : [];
  });
}
