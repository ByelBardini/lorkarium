import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { SceneNotFoundError } from './scenes.error';

export type GridVisibility = 'private' | 'public';
export type GridKind = 'grid' | 'cast';

/** What decides who reaches a grid: which one it is, whether it is public and, when known,
 *  whether it is the table's cast (absent = a grid of the library). */
export type GridReach = Readonly<{ id: string; visibility: GridVisibility; kind?: GridKind }>;

/** Who sees and acts in each grid of the table: the master in any; a player in the group grid
 *  (even while private) and in public ones. The cast (the anchors of the characters) is seen by
 *  every member and acted on by no one directly. `groupSceneId` is the table's active scene.
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
    if (scene.kind === 'cast' || this.seesEveryGrid()) return true;
    return scene.id === this.groupSceneId || scene.visibility === 'public';
  }

  /** Whether a board command may name `scene`: any grid it sees, never the cast (its anchors
   *  change only through the tokens linked to them).
   *
   *  Example: `access.canAct({ id: castId, visibility: 'private', kind: 'cast' }) // false` */
  canAct(scene: GridReach): boolean {
    return scene.kind !== 'cast' && this.canSee(scene);
  }

  /** Refuses a grid a command may not name with SCENE_NOT_FOUND, never FORBIDDEN (critério 14).
   *
   *  Example: `access.requireAct({ id: sceneId, visibility: 'private' })` */
  requireAct(scene: GridReach): void {
    if (!this.canAct(scene)) this.refuse(scene);
  }

  /** Refuses a grid out of sight (a snapshot) with SCENE_NOT_FOUND; the cast is in every
   *  member's sight.
   *
   *  Example: `access.requireSee({ id: castId, visibility: 'private', kind: 'cast' })` */
  requireSee(scene: GridReach): void {
    if (!this.canSee(scene)) this.refuse(scene);
  }

  private refuse(scene: GridReach): never {
    const campaignId = this.campaign.campaignIdOf();
    throw new SceneNotFoundError(campaignId, scene.id, this.campaign.userIdOf());
  }
}
