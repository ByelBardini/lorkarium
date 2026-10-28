import type { SetTokenFormCommandDto, TokenFormChangedDto } from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort, GridEvent } from '../scenes/board-publisher.port';
import {
  inLockedGridWithCast,
  savedEventBase,
  type CastAndGridChange,
  type LockedGridMaybeCast,
  type SavedInCastAndGrid,
} from '../scenes/locked-cast';
import { stateHolderIn, type StateHolder } from './linked-token';
import { formBoxOf, isShowing, requireActiveForm, requireForm } from './token-forms.bo';
import {
  tokenAccessOf,
  tokenIn,
  type TokenTransactionRunner,
  type TokenWriteDaos,
} from './token-transaction';
import { NO_VEIL, cutsOf, tokenSeenBy } from './token-veil.mapper';
import { publishVeiledLights, veiledWriteOf, type VeiledWrite } from './token-veil';
import type { TokenRow } from './tokens.dao';
import type { TokenFormPo } from './tokens.po';

export type SetTokenForm = Omit<SetTokenFormCommandDto, 'actionId' | 'campaignId'>;

export type TokenFormServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Switched = Readonly<{
  row: TokenRow;
  form: TokenFormPo;
  box: TokenBox;
  holder: StateHolder;
  veiled: VeiledWrite;
}>;

/** A token switching to one of its forms on the map: it takes the form's image, frame and size, and keeps
 *  its bars, conditions, controllers and place (the top-left corner, stepped back into the scene).
 *
 *  Example: `await tokenForm.setForm(user.id, campaignId, { tokenId, formId: wolfId })` */
export class TokenFormService {
  constructor(private readonly deps: TokenFormServiceDeps) {}

  /** The master, or a controller on any layer (like the look). On a linked token the image, the
   *  frame and the shown form are its anchor's (an event of the cast) and the box its own (an event of the
   *  grid). Switching to the form already shown changes nothing: same version, no event. */
  async setForm(userId: string, campaignId: string, command: SetTokenForm): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCast(this.deps.transaction, address, (locked) =>
      this.switchIn(locked, access, command),
    );
    if (saved.value) this.publish(campaignId, saved, saved.value);
    return saved.version;
  }

  private async switchIn(
    locked: LockedGridMaybeCast<TokenWriteDaos>,
    access: CampaignAccessBo,
    command: SetTokenForm,
  ): Promise<CastAndGridChange<Switched | null>> {
    const { daos, scene } = locked;
    const row = await tokenIn(daos, scene, scene.campaignId, command.tokenId);
    tokenAccessOf(access, row).requireControl('setForm');
    const form = requireForm(row.token.id, row.forms, command.formId);
    requireActiveForm(row.token.id, command.expect, row.token.activeFormId);
    const box = formBoxOf(scene, row.token, form);
    if (isShowing(row.token, form, box)) return { value: null, grid: false, cast: false };
    const holder = stateHolderIn(locked, row);
    const veiled = await writeForm(daos, { row, form, box, holder });
    return { value: { row, form, box, holder, veiled }, grid: true, cast: holder.inCast };
  }

  private publish(
    campaignId: string,
    saved: SavedInCastAndGrid<unknown>,
    { row, form, box, holder, veiled }: Switched,
  ): void {
    const look = lookOf(form);
    if (saved.cast) {
      const event = { ...savedEventBase(campaignId, saved.cast, this.deps.clock), ...look };
      this.deps.publisher.tokenFormChanged({ ...event, tokenId: holder.tokenId }, NO_VEIL);
    }
    if (!saved.grid) return;
    const base = savedEventBase(campaignId, saved.grid, this.deps.clock);
    const event: GridEvent<TokenFormChangedDto> = { ...base, ...look, tokenId: row.token.id, box };
    this.deps.publisher.tokenFormChanged(event, cutsOf(event, veiled.veil, tokenSeenBy));
    publishVeiledLights(this.deps.publisher, base, veiled.lights);
  }
}

// What the holder takes from the form: its image, its frame and the form itself.
function lookOf({
  id,
  imageAssetId,
  frame,
}: TokenFormPo): Pick<TokenFormChangedDto, 'activeFormId' | 'imageAssetId' | 'frame'> {
  return { activeFormId: id, imageAssetId, frame };
}

// The box on the token of the grid, the image and the form on the holder. The resize goes first:
// it clears the form of a token whose size changes, and the restyle, naming the form, sets it.
async function writeForm(
  daos: TokenWriteDaos,
  { row, form, box, holder }: Omit<Switched, 'veiled'>,
): Promise<VeiledWrite> {
  await daos.tokens.resizeMany(row.token.sceneId, [{ tokenId: row.token.id, ...box }]);
  const look = lookOf(form);
  await daos.tokens.restyle([holder.tokenId], look);
  const switchedRow = { ...row, token: { ...row.token, ...box, ...look } };
  return veiledWriteOf(daos, row.token.sceneId, [switchedRow]);
}
