import type { NodeEnv } from '../../config/env';
import { DEV_PLAYERS } from '../auth/dev-players-seed.bo';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import type { CampaignJoinService } from '../campaigns/campaign-join.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { LightsService } from '../lights/lights.service';
import type { ScenesService } from '../scenes/scenes.service';
import type { TokenBatchService } from '../tokens/token-batch.service';
import type { WallsService } from '../walls/walls.service';
import { StressSeedPlayersMissingError } from './dev-seed.error';
import {
  inStressBatches,
  requireStressSeedAllowed,
  STRESS_CAMPAIGN_NAME,
  stressSceneOf,
  type StressScene,
} from './stress-scene.bo';

export type StressSceneSeedDeps = Readonly<{
  users: Pick<UsersDao, 'findByEmail'>;
  campaigns: Pick<CampaignsService, 'create' | 'listMine'>;
  join: Pick<CampaignJoinService, 'join'>;
  scenes: Pick<ScenesService, 'configure'>;
  walls: Pick<WallsService, 'createMany'>;
  lights: Pick<LightsService, 'createMany'>;
  tokens: Pick<TokenBatchService, 'createMany'>;
}>;

export type StressSceneSeedResult = Readonly<{ campaignId: string; created: boolean }>;

type Players = Readonly<{ master: UserPo; player: UserPo }>;

/** `pnpm db:seed-stress`: Bia's table at the target scale (docs/context/client/performance.md),
 *  built through the very services the board uses, in batches they accept; Caio joins by the
 *  code. Never in production, and never twice.
 *
 *  Example: `await new StressSceneSeedService(deps).seed(env.nodeEnv)` */
export class StressSceneSeedService {
  constructor(private readonly deps: StressSceneSeedDeps) {}

  async seed(nodeEnv: NodeEnv): Promise<StressSceneSeedResult> {
    requireStressSeedAllowed(nodeEnv);
    const { master, player } = await this.players();
    const mine = await this.deps.campaigns.listMine(master.id);
    const existing = mine.find(
      ({ name, myRole }) => name === STRESS_CAMPAIGN_NAME && myRole === 'master',
    );
    if (existing) return { campaignId: existing.id, created: false };
    const campaign = await this.deps.campaigns.create(master.id, {
      ...{ name: STRESS_CAMPAIGN_NAME, visibility: 'private', system: null },
      ...{ status: null, description: 'Cena de estresse do bench de desempenho.' },
    });
    if (campaign.joinCode) await this.deps.join.join(player.id, { code: campaign.joinCode });
    await this.fill(master.id, campaign.id, stressSceneOf(player.id));
    return { campaignId: campaign.id, created: true };
  }

  private async players(): Promise<Players> {
    const [master, player] = await Promise.all(
      DEV_PLAYERS.map(({ email }) => this.deps.users.findByEmail(email)),
    );
    if (master && player) return { master, player };
    const missing = DEV_PLAYERS.filter((_, index) => !(index === 0 ? master : player));
    throw new StressSeedPlayersMissingError(missing.map(({ email }) => email));
  }

  private async fill(masterId: string, campaignId: string, scene: StressScene): Promise<void> {
    await this.deps.scenes.configure(masterId, campaignId, {
      grid: scene.grid,
      vision: scene.vision,
    });
    for (const walls of inStressBatches(scene.walls)) {
      await this.deps.walls.createMany(masterId, campaignId, { walls });
    }
    for (const lights of inStressBatches(scene.lights)) {
      await this.deps.lights.createMany(masterId, campaignId, { lights });
    }
    for (const tokens of inStressBatches(scene.tokens)) {
      await this.deps.tokens.createMany(masterId, campaignId, { tokens });
    }
  }
}
