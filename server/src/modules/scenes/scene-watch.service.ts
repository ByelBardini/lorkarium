import type { CampaignRole } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import { reachedGridOf, type SceneTransaction } from './locked-scene';
import type { ScenesDao } from './scenes.dao';

/** The DAOs of the watch transaction, bound to its `tx`. */
export type SceneShareDaos = Readonly<{ scenes: Pick<ScenesDao, 'shareInCampaign'> }>;

export type SceneWatchServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  share: SceneTransaction<SceneShareDaos>;
  scenes: Pick<ScenesDao, 'findActiveOf' | 'findCastOf'>;
}>;

/** Enters the rooms of one grid; the role picks the masters' room too. */
export type EnterGridRooms = (role: CampaignRole) => Promise<void> | void;

/** Who may have which grid open (the group one, or an extra tab by `scene:watch`), checked under
 *  a share lock on the grid and the table.
 *
 *  Example: `await sceneWatch.watch(user.id, campaignId, torreId, (role) => socket.join(rooms))` */
export class SceneWatchService {
  constructor(private readonly deps: SceneWatchServiceDeps) {}

  /** Checks the requester reaches the grid and enters its rooms before the lock is released: a
   *  change of access committed later finds the socket already there (and evicts it); one
   *  committed before refuses the watch with SCENE_NOT_FOUND.
   *
   *  Example: `await sceneWatch.watch(bia.id, campaignId, torreId, enter) // SCENE_NOT_FOUND if private` */
  async watch(
    userId: string,
    campaignId: string,
    sceneId: string,
    enter: EnterGridRooms,
  ): Promise<void> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    const role = access.requireMember();
    await this.deps.share(async ({ scenes }) => {
      const row = await scenes.shareInCampaign(campaignId, sceneId);
      reachedGridOf({ campaignId, sceneId, access }, row);
      await enter(role);
    });
  }

  /** The group grid of a table (its active scene), or `null` for a table without one.
   *
   *  Example: `const groupId = await sceneWatch.groupSceneIdOf(campaignId)` */
  async groupSceneIdOf(campaignId: string): Promise<string | null> {
    return (await this.deps.scenes.findActiveOf(campaignId))?.id ?? null;
  }

  /** The cast of a table (the scene of the characters' anchors), or `null` for a table without
   *  one. Every member follows it, like the group grid.
   *
   *  Example: `const castId = await sceneWatch.castSceneIdOf(campaignId)` */
  async castSceneIdOf(campaignId: string): Promise<string | null> {
    return (await this.deps.scenes.findCastOf(campaignId))?.id ?? null;
  }
}
