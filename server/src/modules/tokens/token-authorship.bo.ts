import { canCreateTokens, tokenRightsOf, type TableTokenRights } from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';

type CellRange = Readonly<{ bright: number; dim: number }>;
type LightRange = CellRange & Readonly<{ color: string | null; angle: number }>;

/** What opens the fog: a player never sets it, so it stays as the token has it. */
export type TokenVision = Readonly<{
  sight: CellRange | null;
  light: LightRange | null;
  sightAngle: number;
}>;

/** The vision a command sends; an absent field keeps what the token has. */
export type VisionChange = Readonly<{
  sight?: CellRange | null | undefined;
  light?: LightRange | null | undefined;
  sightAngle?: number | undefined;
}>;

/** What a create asks for, as far as authorship goes (absent layer = `tokens`). */
export type TokenCreation = VisionChange & Readonly<{ layer?: string | undefined }>;

/** What a pasted copy carries besides a create: whether it is hidden and the entry it joins. */
export type PastedCopy = TokenCreation &
  Readonly<{ hidden?: boolean | undefined; combatantId?: string | undefined }>;

/** A saved token as authorship sees it: who created it and whether it is linked. */
export type AuthoredToken = Readonly<{
  tokenId: string;
  createdBy: string | null;
  anchorTokenId: string | null;
}>;

export type EditedToken = AuthoredToken & Readonly<{ vision: TokenVision }>;

/** What an edit changes, as far as authorship goes. */
export type TokenEdit = VisionChange & Readonly<{ controllerIds: readonly string[] }>;

// The vision of a token nobody set: blind, no light, every side.
const NEW_TOKEN_VISION: TokenVision = { sight: null, light: null, sightAngle: 360 };
const VISION_FIELDS = ['sight', 'light', 'sightAngle'] as const;
const NO_VISION = 'the master role (players never set sight or light)';
// A player's copy lands like their new token: on Tokens, visible, blind, unlit, out of combat.
const PLAYER_COPY = {
  layer: 'tokens',
  hidden: false,
  combatantId: undefined,
  sight: null,
  light: null,
  sightAngle: 360,
} as const;

/** Who creates, edits and deletes tokens (spec §3.9): the master everything; a player by the two
 *  table settings, only tokens they created, never their vision, and never leaving the control.
 *
 *  Example: `new TokenAuthorshipBo(access, { create: true, delete: false }).requireCreate(command)` */
export class TokenAuthorshipBo {
  constructor(
    private readonly campaign: CampaignAccessBo,
    private readonly rights: TableTokenRights,
  ) {}

  /** A new token: a player needs the create setting, the tokens layer and the default vision.
   *
   *  Example: `authorship.requireCreate({ layer: 'tokens' })` */
  requireCreate(creation: TokenCreation): void {
    if (this.campaign.isMaster()) return;
    if (!canCreateTokens(this.viewer(), this.rights))
      this.campaign.forbid(
        'create a token',
        'the master role or the players-create-tokens setting',
      );
    const layer = creation.layer ?? 'tokens';
    if (layer !== 'tokens')
      this.campaign.forbid(`create a token on the ${layer} layer`, 'the master role');
    const field = changedVisionField(NEW_TOKEN_VISION, creation);
    if (field) this.campaign.forbid(`create a token with ${field}`, NO_VISION);
  }

  /** A pasted copy as its creator may make it: the master's as copied, a player's like their new
   *  token (`requireCreate` still decides whether it may be made at all).
   *
   *  Example: `const copies = command.tokens.map((token) => authorship.copyOf(token))` */
  copyOf<T extends PastedCopy>(copy: T): T {
    if (this.campaign.isMaster()) return copy;
    return { ...copy, ...PLAYER_COPY };
  }

  /** The control of a new token: its player creator first, never repeated; the master's as sent.
   *
   *  Example: `authorship.newControllersOf([caioId]) // [biaId, caioId] for Bia` */
  newControllersOf(controllerIds: readonly string[]): string[] {
    if (this.campaign.isMaster()) return [...controllerIds];
    const creator = this.campaign.userIdOf();
    return [creator, ...controllerIds.filter((userId) => userId !== creator)];
  }

  /** An edit: a player only on an unlinked token they created, with the create setting, without
   *  touching its vision and keeping themselves in the control.
   *
   *  Example: `authorship.requireEdit(toEditedToken(found), command)` */
  requireEdit(token: EditedToken, edit: TokenEdit): void {
    if (this.campaign.isMaster()) return;
    const id = token.tokenId;
    if (!tokenRightsOf(this.viewer(), this.rights, token).edit)
      this.campaign.forbid(
        `edit token ${id}`,
        'the master role, or being its creator with the players-create-tokens setting (unlinked)',
      );
    const field = changedVisionField(token.vision, edit);
    if (field) this.campaign.forbid(`change the ${field} of token ${id}`, NO_VISION);
    if (!edit.controllerIds.includes(this.campaign.userIdOf()))
      this.campaign.forbid(
        `leave the control of token ${id}`,
        'the master role (the creator stays in the control)',
      );
  }

  /** A deletion of one token or a batch: a player only of tokens they created, with the delete
   *  setting; the first that is not refuses them all.
   *
   *  Example: `authorship.requireDelete(rows.map(toAuthoredToken))` */
  requireDelete(tokens: readonly AuthoredToken[]): void {
    if (this.campaign.isMaster()) return;
    const viewer = this.viewer();
    const refused = tokens.find((token) => !tokenRightsOf(viewer, this.rights, token).delete);
    if (!refused) return;
    this.campaign.forbid(
      `delete token ${refused.tokenId}`,
      'the master role, or being its creator with the players-delete-tokens setting (unlinked)',
    );
  }

  private viewer(): Readonly<{ role: 'master' | 'player'; userId: string }> {
    return { role: this.campaign.requireMember(), userId: this.campaign.userIdOf() };
  }
}

function changedVisionField(current: TokenVision, change: VisionChange): string | undefined {
  return VISION_FIELDS.find((field) => {
    const sent = change[field];
    return sent !== undefined && !sameValue(sent, current[field]);
  });
}

// Plain values from the wire or from the columns: compared field by field, in a fixed key order.
function sameValue(a: CellRange | LightRange | number | null, b: typeof a): boolean {
  return JSON.stringify(sortedEntries(a)) === JSON.stringify(sortedEntries(b));
}

function sortedEntries(value: object | number | null): unknown {
  if (value === null || typeof value === 'number') return value;
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}
