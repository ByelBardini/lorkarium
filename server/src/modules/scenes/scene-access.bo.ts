import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { SceneNotFoundError } from './scenes.error';

export type GridVisibility = 'private' | 'public';

/** What decides who reaches a grid: which one it is and whether it is public. */
export type GridReach = Readonly<{ id: string; visibility: GridVisibility }>;

/** Who sees and acts in each grid of the table: the master in any; a player in the group grid
 *  (even while private) and in public ones. `groupSceneId` is the table's active scene.
 *
 *  Example: `new SceneAccessBo(campaignAccess, campaign.activeSceneId).requireAct(scene)` */
export class SceneAccessBo {
  constructor(
    private readonly campaign: CampaignAccessBo,
    private readonly groupSceneId: string | null,
  ) {}

  /** Whether every grid is in reach (the master), private ones included; a non-member gets
   *  CAMPAIGN_NOT_FOUND. */
  seesEveryGrid(): boolean {
    return this.campaign.isMaster();
  }

  /** Whether `scene` is in reach of this member.
   *
   *  Example: `scenes.filter((scene) => access.canSee(scene))` */
  canSee(scene: GridReach): boolean {
    if (this.seesEveryGrid()) return true;
    return scene.id === this.groupSceneId || scene.visibility === 'public';
  }

  /** Refuses a grid a command may not name with SCENE_NOT_FOUND, never FORBIDDEN (critério 14).
   *
   *  Example: `access.requireAct({ id: sceneId, visibility: 'private' })` */
  requireAct(scene: GridReach): void {
    if (!this.canSee(scene)) this.refuse(scene);
  }

  private refuse(scene: GridReach): never {
    const campaignId = this.campaign.campaignIdOf();
    throw new SceneNotFoundError(campaignId, scene.id, this.campaign.userIdOf());
  }
}
