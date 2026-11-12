import type { CharacterChangesInput, SheetFrameRequestDto } from '@lorkarium/contracts';
import type { AssetsApi } from '@/services/assets-api';
import type { BoardCommandResult, TableScope } from '@/services/board-command-sender';
import {
  refusedByKind,
  refusedWith,
  SHEET_BRIDGE_DONE,
  type SheetBridgeAnswer,
} from './sheet-bridge-answer';
import type { SheetCharacterView } from './sheet-token-source';

/** The character command the sheet's requests turn into (`character:update`). */
export interface SheetCharacterCommands {
  updateCharacter(
    scope: TableScope,
    characterId: string,
    changes: CharacterChangesInput,
  ): Promise<BoardCommandResult>;
}

type StatsChanges = Extract<SheetFrameRequestDto, { type: 'character.set' }>['changes'];
type FrameImage = Extract<SheetFrameRequestDto, { type: 'character.setImage' }>['image'];

/** What a character request acts on: the holder the host chose (never the frame), `null` for a
 *  loose token or no holder, `'waiting'` while its source is loading. */
export type SheetCharacterTarget = Readonly<{
  campaignId: string;
  character: SheetCharacterView | null | 'waiting';
  commands: SheetCharacterCommands;
}>;

function characterOrRefusal(
  target: SheetCharacterTarget,
  request: string,
): SheetCharacterView | SheetBridgeAnswer {
  if (target.character === 'waiting')
    return refusedWith('NO_CHARACTER', `${request} refused: character not loaded`);
  if (target.character === null)
    return refusedWith('NO_CHARACTER', `${request} refused: this sheet is not a character's`);
  return target.character;
}

function isAnswer(value: SheetCharacterView | SheetBridgeAnswer): value is SheetBridgeAnswer {
  return 'ok' in value;
}

/** Whether `changes` would leave AC and DC as the character already has them.
 *
 *  Example: `sameStats(lyra, { armorClass: 15 }) // true when Lyra's AC is 15` */
export function sameStats(character: SheetCharacterView, changes: StatsChanges): boolean {
  const { armorClass, difficultyClass } = changes;
  if (armorClass !== undefined && armorClass !== character.armorClass) return false;
  return difficultyClass === undefined || difficultyClass === character.difficultyClass;
}

/** `character.set`: AC and DC of the sheet's character by the usual `character:update`; the same
 *  values it already has send nothing.
 *
 *  Example: `await setCharacterStats(target, { armorClass: 14 })` */
export async function setCharacterStats(
  target: SheetCharacterTarget,
  changes: StatsChanges,
): Promise<SheetBridgeAnswer> {
  const character = characterOrRefusal(target, 'character.set');
  if (isAnswer(character)) return character;
  if (sameStats(character, changes)) return SHEET_BRIDGE_DONE;
  return updated(target, character.id, changes, 'character.set');
}

/** `character.setImage`: the bytes go up as a `token` image (the portrait's processing) and the
 *  new asset becomes the character's portrait. An update refused after the upload leaves the
 *  asset unused, as the room's own portrait field does.
 *
 *  Example: `await setCharacterImage(target, assets, { type: 'image/png', bytes })` */
export async function setCharacterImage(
  target: SheetCharacterTarget,
  assets: Pick<AssetsApi, 'upload'>,
  image: FrameImage,
): Promise<SheetBridgeAnswer> {
  const character = characterOrRefusal(target, 'character.setImage');
  if (isAnswer(character)) return character;
  const file = new Blob([image.bytes], { type: image.type });
  const upload = await assets.upload(target.campaignId, file, 'token');
  if (!upload.ok) return refusedByKind('character.setImage', upload.failure.kind);
  const changes = { imageAssetId: upload.asset.id };
  return updated(target, character.id, changes, 'character.setImage');
}

async function updated(
  target: SheetCharacterTarget,
  characterId: string,
  changes: CharacterChangesInput,
  request: string,
): Promise<SheetBridgeAnswer> {
  const scope = { campaignId: target.campaignId };
  const result = await target.commands.updateCharacter(scope, characterId, changes);
  if (result.ok) return SHEET_BRIDGE_DONE;
  const { failure } = result;
  return refusedByKind(request, typeof failure === 'object' ? failure.kind : failure);
}
