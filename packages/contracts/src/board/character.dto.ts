import { z } from 'zod';
import { realtimeAckFailureDto, stateVersionDto } from '../http/realtime-ack.dto';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import type { BoardCommandAckDto } from './board.dto';
import { conditionChangeDto } from './combat.dto';
import { activeConditionDto } from './condition.dto';
import {
  CHARACTER_NOTE_MAX,
  CHARACTER_STAT_MAX,
  characterStatDto,
  characterTextDto,
} from './character-fields.dto';
import { tokenAuraDto } from './token-aura.dto';
import {
  MAX_BARS_PER_TOKEN,
  TOKEN_INITIALS_MAX_LENGTH,
  TOKEN_NAME_MAX_LENGTH,
  barChangeDto,
  cellIndexDto,
  tokenBarDto,
  tokenFrameDto,
  tokenSideDto,
  tokenSideLengthDto,
} from './token.dto';

export { CHARACTER_NOTE_MAX, CHARACTER_STAT_MAX } from './character-fields.dto';
/** A character's name is the name its linked tokens wear, so it has the token's limit. */
export const CHARACTER_NAME_MAX = TOKEN_NAME_MAX_LENGTH;

/** `token:linkToCard` (master): the token becomes the character of `memberId` (a player). The
 *  first link creates the anchor in the cast with the token's bars, conditions and controllers;
 *  a later one, in another grid, adopts the anchor's (the token's own are dropped).
 *
 *  Example: `linkTokenToCardCommandDto.parse({ actionId, campaignId, sceneId, tokenId, memberId })` */
export const linkTokenToCardCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  memberId: z.uuid(),
});
export type LinkTokenToCardCommandDto = z.infer<typeof linkTokenToCardCommandDto>;

/** `token:unlinkFromCard` (master): the token keeps a copy of what it showed (the anchor's
 *  identity, bars, controllers and conditions) and stops following it; the anchor stays.
 *
 *  Example: `unlinkTokenFromCardCommandDto.parse({ actionId, campaignId, sceneId, tokenId })` */
export const unlinkTokenFromCardCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
});
export type UnlinkTokenFromCardCommandDto = z.infer<typeof unlinkTokenFromCardCommandDto>;

/** `token:addPlayers` (master): puts in the grid a token linked to each player who has an anchor,
 *  in the free cells around `center` (the middle of the master's view).
 *
 *  Example: `addPlayersCommandDto.parse({ actionId, campaignId, sceneId, center: { col: 10, row: 6 } })` */
export const addPlayersCommandDto = z.strictObject({
  ...boardCommandShape,
  center: z.strictObject({ col: cellIndexDto, row: cellIndexDto }),
});
export type AddPlayersCommandDto = z.infer<typeof addPlayersCommandDto>;

/** Answer to `token:addPlayers`: the ids of the tokens created (in the order of the players) and
 *  the players skipped because they have no anchor yet. With nobody to place, `createdIds` is
 *  empty and the version did not change. */
export const addPlayersAckDto = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    version: stateVersionDto,
    createdIds: z.array(z.uuid()),
    skippedMemberIds: z.array(z.uuid()),
  }),
  realtimeAckFailureDto,
]);
export type AddPlayersAckDto = z.infer<typeof addPlayersAckDto>;

/** `condition:changedMany`, to the cast: the conditions of anchors after the end of a turn of a
 *  token linked to them (counted down, the expired gone), in the cast's version. */
export const conditionsChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(conditionChangeDto),
});
export type ConditionsChangedDto = z.infer<typeof conditionsChangedDto>;

/** A player's character at the table (spec §6 `Character`): the one source of the identity,
 *  bars, conditions and control that every token linked to it wears in every grid; the place,
 *  layer, facing, flips, sight and light stay on each token. `userId` is `null` once the player
 *  left the table (only the masters still see it). `width`/`height` are the size a new linked
 *  token gets. Redacted per viewer like a token: a `controllers` bar is absent for the others.
 *
 *  Example: `characterDto.parse(event.characters[0]).armorClass // 15` */
export const characterDto = z.strictObject({
  id: z.uuid(),
  campaignId: z.uuid(),
  userId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(CHARACTER_NAME_MAX),
  initials: z.string().trim().min(1).max(TOKEN_INITIALS_MAX_LENGTH),
  side: tokenSideDto,
  imageAssetId: z.uuid().nullable(),
  frame: tokenFrameDto,
  defeated: z.boolean(),
  aura: tokenAuraDto.nullable(),
  width: tokenSideLengthDto,
  height: tokenSideLengthDto,
  armorClass: z.number().int().min(0).max(CHARACTER_STAT_MAX).nullable(),
  difficultyClass: z.number().int().min(0).max(CHARACTER_STAT_MAX).nullable(),
  noteOne: z.string().max(CHARACTER_NOTE_MAX).nullable(),
  noteTwo: z.string().max(CHARACTER_NOTE_MAX).nullable(),
  bars: z.array(tokenBarDto).max(MAX_BARS_PER_TOKEN),
  conditions: z.array(activeConditionDto),
  controllerIds: z.array(z.uuid()).max(32),
  /** The server's answer to "may this viewer change it" (its player or a master). */
  canControl: z.boolean(),
  /** The sheet the card and the dock open in one click; `null` = none yet. */
  mainSheetId: z.uuid().nullable(),
});
export type CharacterDto = z.infer<typeof characterDto>;

const CHARACTER_CHANGE_FIELDS = [
  'name',
  'armorClass',
  'difficultyClass',
  'noteOne',
  'noteTwo',
] as const;

/** The card fields of a character to change: absent stays, `null` (or only spaces) clears a note
 *  or a number; the name is trimmed and never empty.
 *
 *  Example: `characterChangesDto.parse({ armorClass: 15 })` */
export const characterChangesDto = z
  .strictObject({
    name: z.string().trim().min(1).max(CHARACTER_NAME_MAX).optional(),
    armorClass: characterStatDto('armorClass').optional(),
    difficultyClass: characterStatDto('difficultyClass').optional(),
    noteOne: characterTextDto('noteOne', CHARACTER_NOTE_MAX).optional(),
    noteTwo: characterTextDto('noteTwo', CHARACTER_NOTE_MAX).optional(),
  })
  .superRefine((changes, context) => {
    if (Object.keys(changes).length > 0) return;
    context.addIssue({
      code: 'custom',
      message: `changes is empty; expected at least one of ${CHARACTER_CHANGE_FIELDS.join(', ')}`,
    });
  });
export type CharacterChangesDto = z.infer<typeof characterChangesDto>;
export type CharacterChangesInput = z.input<typeof characterChangesDto>;

/** Fields of every character command: the table, never who asks (§7.3) nor a grid. */
const characterCommandShape = { actionId: z.uuid(), campaignId: z.uuid(), characterId: z.uuid() };

/** `character:update` (its player or a master).
 *
 *  Example: `updateCharacterCommandDto.parse({ actionId, campaignId, characterId, changes: { armorClass: 15 } })` */
export const updateCharacterCommandDto = z.strictObject({
  ...characterCommandShape,
  changes: characterChangesDto,
});
export type UpdateCharacterCommandDto = z.infer<typeof updateCharacterCommandDto>;

/** `character:adjustBar` (its player or a master): the dock's bars without a token in the grid.
 *
 *  Example: `adjustCharacterBarCommandDto.parse({ …, barId, change: { op: 'add', amount: -7 } })` */
export const adjustCharacterBarCommandDto = z.strictObject({
  ...characterCommandShape,
  barId: z.uuid(),
  change: barChangeDto,
});
export type AdjustCharacterBarCommandDto = z.infer<typeof adjustCharacterBarCommandDto>;

/** `character:setMainSheet` (its player or a master): one of its sheets becomes the main one.
 *
 *  Example: `setMainSheetCommandDto.parse({ actionId, campaignId, characterId, sheetId })` */
export const setMainSheetCommandDto = z.strictObject({
  ...characterCommandShape,
  sheetId: z.uuid(),
});
export type SetMainSheetCommandDto = z.infer<typeof setMainSheetCommandDto>;

/** `token:linkToCharacter` (master): the token becomes an instance of the character; its own
 *  bars, conditions and controllers are dropped (it wears the character's).
 *
 *  Example: `linkTokenToCharacterCommandDto.parse({ actionId, campaignId, sceneId, tokenId, characterId })` */
export const linkTokenToCharacterCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  characterId: z.uuid(),
});
export type LinkTokenToCharacterCommandDto = z.infer<typeof linkTokenToCharacterCommandDto>;

/** `token:unlinkFromCharacter` (master): the token keeps a copy of what it showed and stops
 *  following the character, which stays.
 *
 *  Example: `unlinkTokenFromCharacterCommandDto.parse({ actionId, campaignId, sceneId, tokenId })` */
export const unlinkTokenFromCharacterCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
});
export type UnlinkTokenFromCharacterCommandDto = z.infer<typeof unlinkTokenFromCharacterCommandDto>;

/** Fields of every character event: the table, its characters' version and when (§5.5). The
 *  characters have one version per table, apart from the grids'. */
const characterEventShape = {
  campaignId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
};

/** `character:changed`: the characters one command changed, whole, as this viewer may see them,
 *  all in one version.
 *
 *  Example: `characterChangedEventDto.parse(event).characters[0]?.bars` */
export const characterChangedEventDto = z.strictObject({
  ...characterEventShape,
  characters: z.array(characterDto).min(1),
});
export type CharacterChangedEventDto = z.infer<typeof characterChangedEventDto>;

/** `character:removed`: the character is no longer for this viewer (its player became a
 *  spectator or left the table); it stays stored. */
export const characterRemovedEventDto = z.strictObject({
  ...characterEventShape,
  characterId: z.uuid(),
});
export type CharacterRemovedEventDto = z.infer<typeof characterRemovedEventDto>;

/** `character:sync` payload: the table whose characters to send.
 *
 *  Example: `characterSyncCommandDto.parse({ campaignId })` */
export const characterSyncCommandDto = z.strictObject({ campaignId: z.uuid() });
export type CharacterSyncCommandDto = z.infer<typeof characterSyncCommandDto>;

/** Every character this viewer sees, in the version of the table's characters. */
export const characterSyncDto = z.strictObject({
  version: stateVersionDto,
  characters: z.array(characterDto),
});
export type CharacterSyncDto = z.infer<typeof characterSyncDto>;

/** Answer to `character:sync`. */
export const characterSyncAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), ...characterSyncDto.shape }),
  realtimeAckFailureDto,
]);
export type CharacterSyncAckDto = z.infer<typeof characterSyncAckDto>;

type CharacterAck<Answer> = (answer: Answer) => void;
type CommandAck = CharacterAck<BoardCommandAckDto>;

/** Client → server commands of the characters, merged into `BoardClientEvents`. */
export type CharacterClientEvents = {
  'token:linkToCard': (command: LinkTokenToCardCommandDto, ack: CommandAck) => void;
  'token:unlinkFromCard': (command: UnlinkTokenFromCardCommandDto, ack: CommandAck) => void;
  'token:addPlayers': (command: AddPlayersCommandDto, ack: CharacterAck<AddPlayersAckDto>) => void;
  'token:linkToCharacter': (command: LinkTokenToCharacterCommandDto, ack: CommandAck) => void;
  'token:unlinkFromCharacter': (
    command: UnlinkTokenFromCharacterCommandDto,
    ack: CommandAck,
  ) => void;
  'character:sync': (
    command: CharacterSyncCommandDto,
    ack: CharacterAck<CharacterSyncAckDto>,
  ) => void;
  'character:update': (command: UpdateCharacterCommandDto, ack: CommandAck) => void;
  'character:adjustBar': (command: AdjustCharacterBarCommandDto, ack: CommandAck) => void;
  'character:setMainSheet': (command: SetMainSheetCommandDto, ack: CommandAck) => void;
};

/** Server → room events of the characters, merged into `BoardServerEvents`. */
export type CharacterServerEvents = {
  'condition:changedMany': (event: ConditionsChangedDto) => void;
  'character:changed': (event: CharacterChangedEventDto) => void;
  'character:removed': (event: CharacterRemovedEventDto) => void;
};
