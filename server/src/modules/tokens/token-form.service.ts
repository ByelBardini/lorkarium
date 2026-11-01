import type { SetTokenFormCommandDto, TokenFormChangedDto } from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort, GridEvent } from '../scenes/board-publisher.port';
import { savedEventBase } from '../scenes/locked-cast';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { CharacterRow } from '../characters/characters.dao';
import {
  inLockedGridWithCharacters,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
  type SavedInCharactersAndGrid,
} from '../characters/locked-characters-grid';
import { linkedCharacterIn } from './linked-token';
import { publishCharactersChange, restyleCharacters } from './character-writes';
import { formBoxOf, isShowing, requireActiveForm, requireForm } from './token-forms.bo';
import {
  tokenAccessOf,
  tokenIn,
  type TokenTransactionRunner,
  type TokenWriteDaos,
} from './token-transaction';
import { cutsOf, tokenSeenBy } from './token-veil.mapper';
import { publishVeiledLights, veiledWriteOf, type VeiledWrite } from './token-veil';
import type { TokenRow } from './tokens.dao';
import type { TokenFormPo } from './tokens.po';

export type SetTokenForm = Omit<SetTokenFormCommandDto, 'actionId' | 'campaignId'>;

export type TokenFormServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  /** Where the new look of a linked token's character is told (`character:changed`). */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

type Switched = Readonly<{
  row: TokenRow;
  form: TokenFormPo;
  box: TokenBox;
  /** The character of a linked token, with the form's image and frame (`[]` unlinked). */
  shared: CharacterRow[];
  veiled: VeiledWrite;
}>;

/** A token switching to one of its forms on the map: it takes the form's image, frame and size, and keeps
 *  its bars, conditions, controllers and place (the top-left corner, stepped back into the scene).
 *
 *  Example: `await tokenForm.setForm(user.id, campaignId, { tokenId, formId: wolfId })` */
export class TokenFormService {
  constructor(private readonly deps: TokenFormServiceDeps) {}

  /** The master, or a controller on any layer (like the look). The forms, the shown form and the
   *  box are the token's own (an event of the grid); on a linked token the form's image and frame
   *  go to its character too, since the character lends them to every grid (a
   *  `character:changed`). Switching to the form already shown changes nothing: same version, no
   *  event. */
  async setForm(userId: string, campaignId: string, command: SetTokenForm): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCharacters(this.deps.transaction, address, (locked) =>
      this.switchIn(locked, access, command),
    );
    if (saved.value) this.publish(campaignId, saved, saved.value);
    return saved.version;
  }

  private async switchIn(
    locked: LockedGridMaybeCharacters<TokenWriteDaos>,
    access: CampaignAccessBo,
    command: SetTokenForm,
  ): Promise<CharactersAndGridChange<Switched | null>> {
    const { daos, scene } = locked;
    const row = await tokenIn(daos, scene, scene.campaignId, command.tokenId);
    tokenAccessOf(access, row).requireControl('setForm');
    const form = requireForm(row.token.id, row.forms, command.formId);
    requireActiveForm(row.token.id, command.expect, row.token.activeFormId);
    const box = formBoxOf(scene, row.token, form);
    if (isShowing(row.token, form, box)) return { value: null, grid: false, characters: false };
    const character = await linkedCharacterIn(locked, row);
    const veiled = await writeForm(daos, { row, form, box });
    const ids = character ? [character.character.id] : [];
    const look = { imageAssetId: form.imageAssetId, frame: form.frame };
    const shared = await restyleCharacters(daos, scene.campaignId, ids, look);
    const value = { row, form, box, shared, veiled };
    return { value, grid: true, characters: shared.length > 0 };
  }

  private publish(
    campaignId: string,
    saved: SavedInCharactersAndGrid<unknown>,
    { row, form, box, shared, veiled }: Switched,
  ): void {
    const look = lookOf(form);
    const outlet = { publisher: this.deps.characterPublisher, clock: this.deps.clock };
    publishCharactersChange(outlet, campaignId, saved.characters, shared);
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

// The box, the image and the form on the token of the grid. The resize goes first: it clears the
// form of a token whose size changes, and the restyle, naming the form, sets it.
async function writeForm(
  daos: TokenWriteDaos,
  { row, form, box }: Pick<Switched, 'row' | 'form' | 'box'>,
): Promise<VeiledWrite> {
  await daos.tokens.resizeMany(row.token.sceneId, [{ tokenId: row.token.id, ...box }]);
  const look = lookOf(form);
  await daos.tokens.restyle([row.token.id], look);
  const switchedRow = { ...row, token: { ...row.token, ...box, ...look } };
  return veiledWriteOf(daos, row.token.sceneId, [switchedRow]);
}
