import type {
  NewTokenInput,
  SavedTokenBodyDto,
  SavedTokenBodyInput,
  TokenDto,
} from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';

/** The look of a token as a copy takes it again (paste and saved token): image, frame, mirror,
 *  facing, sight, light, aura and whether it blocks or sees through the veil.
 *
 *  Example: `{ ...copiedLookOf(token), name: token.name }` */
export function copiedLookOf(token: TokenDto) {
  const { imageAssetId, frame, flipX, flipY, facing, sightAngle } = token;
  return {
    imageAssetId,
    frame,
    flipX,
    flipY,
    facing,
    sightAngle,
    sight: token.sight,
    light: token.light,
    aura: token.aura,
    blocksSight: token.blocksSight,
    magicSight: token.magicSight,
  };
}

/** The token as a member saves it to spawn again: what it shows now (a linked token as the free
 *  copy it wears), the bars with their values, the forms without ids and the active one by index;
 *  never its place, control, veil, combat nor character.
 *
 *  Example: `savedTokens.create(campaignId, { name: token.name, token: savedTokenBodyOf(token) })` */
export function savedTokenBodyOf(token: TokenDto): SavedTokenBodyInput {
  const { name, initials, side, width, height, layer } = token;
  const bars = token.bars.map(({ label, current, max, temp, color, visibility, display }) => ({
    ...{ label, current, max, temp },
    ...{ color, visibility, display },
  }));
  const forms = token.forms.map(({ name: formName, imageAssetId, width: w, height: h, frame }) => ({
    ...{ name: formName, imageAssetId, width: w, height: h, frame },
  }));
  const active = token.forms.findIndex((form) => form.id === token.activeFormId);
  const identity = { name, initials, side, width, height, layer };
  return {
    ...identity,
    ...copiedLookOf(token),
    bars,
    forms,
    activeForm: active < 0 ? null : active,
  };
}

/** A saved token on the clicked cell as `token:createMany` takes it: no controllers (the server
 *  puts a player first in them), each form with a new id and the active one pointed at its own.
 *
 *  Example: `commands.createTokens(campaignId, [spawnedTokenOf(saved.token, cell, uuid)])` */
export function spawnedTokenOf(
  body: SavedTokenBodyDto,
  cell: Cell,
  newId: () => string,
): NewTokenInput {
  const { forms, activeForm, ...rest } = body;
  const spawnedForms = forms.map((form) => ({ ...form, id: newId() }));
  const activeFormId = activeForm === null ? null : (spawnedForms[activeForm]?.id ?? null);
  return {
    ...rest,
    col: cell.col,
    row: cell.row,
    controllerIds: [],
    forms: spawnedForms,
    activeFormId,
  };
}
