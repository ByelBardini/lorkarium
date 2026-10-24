import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { SceneTransaction } from './locked-scene';
import type { SceneAudiencePort, TableMove } from './scene-audience.port';
import type { ScenesDao } from './scenes.dao';
import { SceneNotFoundError } from './scenes.error';

/** The DAOs of the activation transaction, bound to its `tx`. */
export type SceneActivationDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockById' | 'setActiveScene'>;
  scenes: Pick<ScenesDao, 'findInCampaign'>;
}>;

export type SceneActivationServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: SceneTransaction<SceneActivationDaos>;
  audience: Pick<SceneAudiencePort, 'moveTable'>;
  publisher: Pick<LibraryPublisherPort, 'sceneActivated' | 'libraryChanged'>;
  clock: ClockPort;
}>;

type Activation = Readonly<{ userId: string; campaignId: string; sceneId: string }>;

/** "Levar o grupo pra cá": the master makes a grid the group grid and the whole table goes along.
 *
 *  Example: `await activation.activate(ana.id, campaignId, estradaId)` */
export class SceneActivationService {
  constructor(private readonly deps: SceneActivationServiceDeps) {}

  /** Saves the new group grid with the table locked (a watch or a library edit waits), and only
   *  after the commit moves every socket of the table and tells it `scene:activated` and
   *  `library:changed`. Activating the group grid again changes and tells nothing.
   *
   *  Example: `await activation.activate(bia.id, campaignId, estradaId) // FORBIDDEN` */
  async activate(userId: string, campaignId: string, sceneId: string): Promise<void> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(`take the group to grid ${sceneId}`);
    const at = this.deps.clock.now().toISOString();
    const activation = { userId, campaignId, sceneId };
    const move = await this.deps.transaction((daos) => this.saveGroupGrid(daos, activation, at));
    if (!move) return;
    await this.deps.audience.moveTable(move);
    const previousSceneId = move.previous?.sceneId ?? null;
    this.deps.publisher.sceneActivated({ campaignId, sceneId, previousSceneId, at });
    this.deps.publisher.libraryChanged({ campaignId, at });
  }

  // `null` when the grid already is the group's: nothing to save nor to move.
  private async saveGroupGrid(
    daos: SceneActivationDaos,
    { userId, campaignId, sceneId }: Activation,
    at: string,
  ): Promise<TableMove | null> {
    const campaign = await daos.campaigns.lockById(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
    const target = await daos.scenes.findInCampaign(campaignId, sceneId);
    if (!target) throw new SceneNotFoundError(campaignId, sceneId, userId);
    const previousId = campaign.activeSceneId;
    if (previousId === sceneId) return null;
    await daos.campaigns.setActiveScene(campaignId, sceneId);
    const previous = previousId ? await daos.scenes.findInCampaign(campaignId, previousId) : null;
    const playersKeepTabs = previous?.visibility === 'public';
    return {
      campaignId,
      sceneId,
      previous: previous ? { sceneId: previous.id, playersKeepTabs } : null,
      at,
    };
  }
}
