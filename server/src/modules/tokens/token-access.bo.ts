import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { TokenLayerPo } from './tokens.po';

export type TokenControl = Readonly<{ tokenId: string; controllerIds: readonly string[] }>;

/** Who sees a token whole: the master and its controllers (`privileged`), or everyone else. */
export type TokenAudience = 'privileged' | 'others';

/** What one member may do with one token (spec §3.9): the master and the token's controllers
 *  move it and touch its bars; anyone else only sees it, redacted.
 *
 *  Example: `new TokenAccessBo(campaignAccess, { tokenId, controllerIds }).requireControl('move')` */
export class TokenAccessBo {
  constructor(
    private readonly campaign: CampaignAccessBo,
    private readonly token: TokenControl,
  ) {}

  canControl(): boolean {
    if (this.campaign.isMaster()) return true;
    return this.token.controllerIds.some((userId) => this.campaign.isUser(userId));
  }

  requireControl(action: string): void {
    if (this.canControl()) return;
    this.campaign.forbid(
      `${action} token ${this.token.tokenId}`,
      'the master role or control of the token',
    );
  }

  /** Only someone listed in the control of the token passes: the master's power does not count.
   *  It is what choosing a main token takes (the dock shows one's own token).
   *
   *  Example: `access.requireListed('choose as main')` */
  requireListed(action: string): void {
    if (this.token.controllerIds.some((userId) => this.campaign.isUser(userId))) return;
    this.campaign.forbid(`${action} token ${this.token.tokenId}`, 'being listed in its control');
  }

  /** Choosing the main token of `playerId`: one's own takes being listed (`requireListed`);
   *  another's takes the master role, and that player being listed in the control.
   *
   *  Example: `access.requireChooseMainFor(biaId)` */
  requireChooseMainFor(playerId: string): void {
    if (this.campaign.isUser(playerId)) return this.requireListed('choose as main');
    this.campaign.requireMaster(`choose the main token of ${playerId}`);
    if (this.token.controllerIds.includes(playerId)) return;
    this.campaign.forbid(
      `choose token ${this.token.tokenId} as main of ${playerId}`,
      'the player being listed in its control',
    );
  }

  /** Moving or dragging: control, and for anyone but the master the token must be on the
   *  `tokens` layer — the players never pick up the objects or the background.
   *
   *  Example: `access.requireMove('drag', row.token.layer)` */
  requireMove(action: string, layer: TokenLayerPo): void {
    this.requireControl(action);
    if (layer === 'tokens' || this.campaign.isMaster()) return;
    this.campaign.forbid(
      `${action} token ${this.token.tokenId} on the ${layer} layer`,
      'the master role, or control of a token on the tokens layer',
    );
  }

  /** The master moves through any wall; everyone else is stopped by the walls that bar movement. */
  ignoresWalls(): boolean {
    return this.campaign.isMaster();
  }

  audience(): TokenAudience {
    return this.canControl() ? 'privileged' : 'others';
  }
}
