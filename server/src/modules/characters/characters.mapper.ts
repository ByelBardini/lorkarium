import {
  CHARACTER_NAME_MAX,
  type ActiveConditionDto,
  type CharacterChangesDto,
  type CharacterDto,
} from '@lorkarium/contracts';
import { initialsOf } from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { toTokenAuraDto } from '../tokens/token-aura.mapper';
import { toTokenBarDto } from '../tokens/tokens.mapper';
import {
  CharacterBo,
  isSeenByTable,
  privilegedUserIdsOf,
  type CharacterAudience,
  type CharacterSeat,
} from './character.bo';
import type { CharacterView } from './character-publisher.port';
import type { CharacterRow, NewCharacterRow } from './characters.dao';
import type { CharacterChangesPo } from './characters.po';

/** A saved character → whose it is, for the rule.
 *
 *  Example: `toCharacterSeat(row).holderRole // 'player'` */
export function toCharacterSeat(row: CharacterRow): CharacterSeat {
  const { id: characterId, userId } = row.character;
  return { characterId, userId, holderRole: row.holderRole, controllerIds: row.controllerIds };
}

/** The rule of one member on one saved character.
 *
 *  Example: `toCharacterBo(access, row).requireEdit('change')` */
export function toCharacterBo(access: CampaignAccessBo, row: CharacterRow): CharacterBo {
  return new CharacterBo(access, toCharacterSeat(row));
}

/** A character as one audience may see it: `others` never receive a `controllers` bar, and the
 *  bars they do receive keep their position (the second does not become "the first").
 *
 *  Example: `toCharacterDto(row, toCharacterBo(access, row).audience())` */
export function toCharacterDto(
  row: CharacterRow,
  audience: CharacterAudience,
  conditions: readonly ActiveConditionDto[] = [],
): CharacterDto {
  const { character } = row;
  const shown = row.bars.filter(
    (bar) => audience === 'privileged' || bar.visibility === 'everyone',
  );
  return {
    ...identityOf(row),
    aura: toTokenAuraDto(character),
    width: character.width,
    height: character.height,
    ...cardOf(row),
    bars: shown.map(toTokenBarDto),
    conditions: [...conditions],
    controllerIds: [...row.controllerIds],
    canControl: audience === 'privileged',
    mainSheetId: character.mainSheetId,
  };
}

/** A saved character in the two versions an event carries, and who gets the whole one.
 *
 *  Example: `publisher.charactersChanged({ ...base, characters: [toCharacterView(row)] })` */
export function toCharacterView(row: CharacterRow): CharacterView {
  const seat = toCharacterSeat(row);
  return {
    characterId: seat.characterId,
    seenByTable: isSeenByTable(seat.holderRole),
    privilegedUserIds: privilegedUserIdsOf(seat),
    privileged: toCharacterDto(row, 'privileged'),
    others: toCharacterDto(row, 'others'),
  };
}

/** The character a player gets on becoming one: their nickname (cut to the name's limit), its
 *  initials by the game-core rule, an ally of one cell, no bars, controlled by them.
 *
 *  Example: `toSeatedCharacterRow(vharnId, dudaId, 'Duda da Silva').character.initials // 'DS'` */
export function toSeatedCharacterRow(
  campaignId: string,
  userId: string,
  nickname: string,
): NewCharacterRow {
  const name = nickname.trim().slice(0, CHARACTER_NAME_MAX);
  const initials = initialsOf(name) || name.charAt(0).toLocaleUpperCase('pt-BR');
  const character = { campaignId, userId, name, initials, side: 'ally' as const };
  return { character, bars: [], controllerIds: [userId] };
}

/** The keys the command carries, and only them: an absent key stays, `null` is written.
 *
 *  Example: `toCharacterChangesPo({ armorClass: 15 })` → `{ armorClass: 15 }` */
export function toCharacterChangesPo(changes: CharacterChangesDto): CharacterChangesPo {
  const present = Object.entries(changes).filter(([, value]) => value !== undefined);
  return Object.fromEntries(present) as CharacterChangesPo;
}

type CharacterIdentityDto = Pick<
  CharacterDto,
  | 'id'
  | 'campaignId'
  | 'userId'
  | 'name'
  | 'initials'
  | 'side'
  | 'imageAssetId'
  | 'frame'
  | 'defeated'
>;
type CharacterCardDto = Pick<
  CharacterDto,
  'armorClass' | 'difficultyClass' | 'noteOne' | 'noteTwo'
>;

function identityOf({ character }: CharacterRow): CharacterIdentityDto {
  const { id, campaignId, userId, name, initials, side, imageAssetId, frame, defeated } = character;
  return { id, campaignId, userId, name, initials, side, imageAssetId, frame, defeated };
}

function cardOf({ character }: CharacterRow): CharacterCardDto {
  const { armorClass, difficultyClass, noteOne, noteTwo } = character;
  return { armorClass, difficultyClass, noteOne, noteTwo };
}
