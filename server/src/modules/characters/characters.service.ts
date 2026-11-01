import type {
  AdjustCharacterBarCommandDto,
  CharacterDto,
  CharacterSyncDto,
  SetMainSheetCommandDto,
  UpdateCharacterCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf, viewerAccessOf } from '../campaigns/member-access';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { toConditionDefinitionDto } from '../conditions/conditions.mapper';
import type { SheetsDao } from '../sheets/sheets.dao';
import type { CharacterBo } from './character.bo';
import type { CharacterPublisherPort } from './character-publisher.port';
import type { CharacterRow, CharactersDao } from './characters.dao';
import { CharacterNotFoundError } from './characters.error';
import {
  toCharacterBo,
  toCharacterChangesPo,
  toCharacterDto,
  toCharacterView,
} from './characters.mapper';
import {
  charactersEventBase,
  inLockedCharacters,
  type CharactersLockDaos,
  type CharactersTransaction,
} from './locked-characters';

export type UpdateCharacter = Omit<UpdateCharacterCommandDto, 'actionId' | 'campaignId'>;
export type AdjustCharacterBar = Omit<AdjustCharacterBarCommandDto, 'actionId' | 'campaignId'>;
export type SetMainSheet = Omit<SetMainSheetCommandDto, 'actionId' | 'campaignId'>;

export type CharacterWriteDaos = CharactersLockDaos &
  Readonly<{
    characters: Pick<
      CharactersDao,
      'lockVersion' | 'bumpVersion' | 'findInCampaign' | 'update' | 'setBarValues' | 'setMainSheet'
    >;
    /** The sheet a `character:setMainSheet` names, read under the characters' lock. */
    sheets: Pick<SheetsDao, 'find'>;
  }>;

export type CharacterReadDaos = Readonly<{
  characters: Pick<CharactersDao, 'versionOf' | 'listOfCampaign'>;
  /** The table's condition list rides the same stream (and version) as the characters. */
  conditions: Pick<ConditionsDao, 'listDefinitions'>;
}>;

export type CharacterTransactionRunner = CharactersTransaction<CharacterWriteDaos>;
/** One consistent read of the table stream and its version (`runInSnapshot`). */
export type CharacterSnapshotRunner = CharactersTransaction<CharacterReadDaos>;

export type CharactersServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: CharacterTransactionRunner;
  snapshot: CharacterSnapshotRunner;
  publisher: CharacterPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
}>;

/** The characters of a table (spec §6): its player, its controllers and the masters change them,
 *  the table hears of it in the characters' own version, apart from the grids'.
 *
 *  Example: `await characters.update(user.id, campaignId, { characterId, changes: { armorClass: 15 } })` */
export class CharactersService {
  constructor(private readonly deps: CharactersServiceDeps) {}

  /** The card fields (name, CA, CD, notes): lock → check → write → bump → commit → publish. */
  async update(userId: string, campaignId: string, command: UpdateCharacter): Promise<number> {
    return this.write(userId, campaignId, command.characterId, async (daos, bo, row) => {
      bo.requireEdit('change');
      await daos.characters.update(row.character.id, toCharacterChangesPo(command.changes));
    });
  }

  /** One bar of the character, by the game-core rule (the dock's bars with no token in the grid). */
  async adjustBar(
    userId: string,
    campaignId: string,
    command: AdjustCharacterBar,
  ): Promise<number> {
    const { barId, change } = command;
    return this.write(userId, campaignId, command.characterId, async (daos, bo, row) => {
      const values = bo.adjustBar(row.bars, barId, change, this.deps.barLimit);
      await daos.characters.setBarValues(barId, values);
    });
  }

  /** One of its sheets becomes the main one (the card and the dock open it first); a sheet of
   *  another character, of nobody or of another table is SHEET_NOT_FOUND.
   *
   *  Example: `await characters.setMainSheet(biaId, vharnId, { characterId: lyraId, sheetId })` */
  async setMainSheet(userId: string, campaignId: string, command: SetMainSheet): Promise<number> {
    const { sheetId } = command;
    return this.write(userId, campaignId, command.characterId, async (daos, bo, row) => {
      bo.requireEdit('choose the main sheet of');
      const sheet = await daos.sheets.find(campaignId, sheetId);
      bo.requireOwnSheet(sheetId, sheet?.characterId ?? null);
      await daos.characters.setMainSheet(row.character.id, sheetId);
    });
  }

  /** The table stream as this member sees it: every character they see, as they may see it, and
   *  the table's condition list, in one version; a spectator reads too (redacted, and never the
   *  characters of spectators).
   *
   *  Example: `(await characters.sync(dudaId, vharnId)).characters.length // 2` */
  async sync(userId: string, campaignId: string): Promise<CharacterSyncDto> {
    const access = await viewerAccessOf(this.deps.members, campaignId, userId);
    const { version, rows, definitions } = await this.deps.snapshot(async (daos) => ({
      version: await daos.characters.versionOf(campaignId),
      rows: await daos.characters.listOfCampaign(campaignId),
      definitions: await daos.conditions.listDefinitions(campaignId),
    }));
    if (version === undefined) throw new Error(`campaign ${campaignId} vanished during its sync`);
    const characters = rows.flatMap((row) => seenDtoOf(access, row));
    return { version, characters, conditionDefinitions: definitions.map(toConditionDefinitionDto) };
  }

  private async write(
    userId: string,
    campaignId: string,
    characterId: string,
    change: (daos: CharacterWriteDaos, bo: CharacterBo, row: CharacterRow) => Promise<void>,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await inLockedCharacters(this.deps.transaction, campaignId, async ({ daos }) => {
      const row = await rowIn(daos, campaignId, characterId);
      await change(daos, toCharacterBo(access, row), row);
      return { value: await rowIn(daos, campaignId, characterId), changed: true };
    });
    const base = charactersEventBase(campaignId, saved.version, this.deps.clock);
    this.deps.publisher.charactersChanged({ ...base, characters: [toCharacterView(saved.value)] });
    return saved.version;
  }
}

function seenDtoOf(access: CampaignAccessBo, row: CharacterRow): CharacterDto[] {
  const bo = toCharacterBo(access, row);
  return bo.isSeen() ? [toCharacterDto(row, bo.audience())] : [];
}

async function rowIn(
  daos: CharacterWriteDaos,
  campaignId: string,
  characterId: string,
): Promise<CharacterRow> {
  const row = await daos.characters.findInCampaign(campaignId, characterId);
  if (!row) throw new CharacterNotFoundError(campaignId, characterId);
  return row;
}
