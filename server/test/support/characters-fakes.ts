import type {
  CharacterPublisherPort,
  CharactersChange,
} from '../../src/modules/characters/character-publisher.port';
import type {
  CharacterRow,
  CharactersDao,
  NewCharacterRow,
  WornCharacterRow,
} from '../../src/modules/characters/characters.dao';
import type { ActiveConditionRow } from '../../src/modules/conditions/conditions.dao';
import type {
  CharacterBarInputPo,
  CharacterBarPo,
  CharacterChangesPo,
  CharacterLookChangesPo,
} from '../../src/modules/characters/characters.po';
import type {
  CharacterReadDaos,
  CharacterSnapshotRunner,
  CharacterTransactionRunner,
  CharacterWriteDaos,
} from '../../src/modules/characters/characters.service';
import type { SheetsDao } from '../../src/modules/sheets/sheets.dao';
import type { SheetPo } from '../../src/modules/sheets/sheets.po';
import type { BarValuesPo } from '../../src/modules/tokens/tokens.po';
import { characterBarPo, characterPo } from './characters-factories';

/** A character as the fake keeps it: its `conditions`, if given, are ignored (reads take them
 *  from `conditionsFrom`). */
type StoredCharacterRow = WornCharacterRow &
  Readonly<{ conditions?: readonly ActiveConditionRow[] }>;

type FakeDaoMethods =
  | 'lockVersion'
  | 'bumpVersion'
  | 'versionOf'
  | 'listOfCampaign'
  | 'findInCampaign'
  | 'findManyInCampaign'
  | 'findOfUser'
  | 'insert'
  | 'update'
  | 'setBarValues'
  | 'setUser'
  | 'setMainSheet'
  | 'replaceBars'
  | 'replaceControllers';

/** In-memory characters and the characters' version of each table. Writes `lock characters`,
 *  `bump characters`, `update`, `set bar`, `insert`, `set user`, `bars` and `controllers` to `journal`
 *  (share it with the publisher fake to read the order). `holderRole` stays as given; an inserted
 *  character takes its player's role from `roles` (absent = none), and `setUser(null)` clears it.
 *
 *  Example: `new CharactersDaoFake(journal, [characterRow()], { [VHARN_ID]: 4 })` */
export class CharactersDaoFake implements Pick<CharactersDao, FakeDaoMethods> {
  /** Stored without their conditions: every read takes them from `conditionsFrom` (none until
   *  it is called), like the DAO reads them from `active_conditions`. */
  readonly rows: StoredCharacterRow[];
  /** The role of each user at the table, for the characters inserted here. */
  readonly roles: Record<string, CharacterRow['holderRole']> = {};
  private conditions: Readonly<{ active: readonly ActiveConditionRow[] }> = { active: [] };

  constructor(
    readonly journal: string[] = [],
    rows: readonly StoredCharacterRow[] = [],
    readonly versions: Record<string, number> = {},
  ) {
    this.rows = [...rows];
  }

  /** The conditions the characters read from now on: the ones of `conditions` held by them.
   *
   *  Example: `characters.conditionsFrom(conditionsFake)` */
  conditionsFrom(conditions: Readonly<{ active: readonly ActiveConditionRow[] }>): void {
    this.conditions = conditions;
  }

  async lockVersion(campaignId: string): Promise<number | undefined> {
    this.journal.push('lock characters');
    return this.versions[campaignId];
  }

  async bumpVersion(campaignId: string): Promise<number> {
    this.journal.push('bump characters');
    const version = (this.versions[campaignId] ?? 0) + 1;
    this.versions[campaignId] = version;
    return version;
  }

  async versionOf(campaignId: string): Promise<number | undefined> {
    return this.versions[campaignId];
  }

  async listOfCampaign(campaignId: string): Promise<CharacterRow[]> {
    return this.held(this.rows.filter((row) => row.character.campaignId === campaignId));
  }

  async findInCampaign(campaignId: string, characterId: string): Promise<CharacterRow | undefined> {
    const [row] = await this.findManyInCampaign(campaignId, [characterId]);
    return row;
  }

  async findManyInCampaign(
    campaignId: string,
    characterIds: readonly string[],
  ): Promise<CharacterRow[]> {
    return this.held(
      this.rows.filter(
        ({ character }) =>
          character.campaignId === campaignId && characterIds.includes(character.id),
      ),
    );
  }

  async findOfUser(campaignId: string, userId: string): Promise<CharacterRow | undefined> {
    const [row] = this.held(
      this.rows.filter(
        (row) => row.character.campaignId === campaignId && row.character.userId === userId,
      ),
    );
    return row;
  }

  async insert(row: NewCharacterRow): Promise<CharacterRow> {
    this.journal.push('insert');
    const character = characterPo({ ...row.character, id: crypto.randomUUID() });
    const bars = row.bars.map((bar, position) => barOf(character.id, bar, position));
    const holderRole = this.roles[character.userId ?? ''] ?? null;
    const saved = { character, bars, controllerIds: [...row.controllerIds], holderRole };
    this.rows.push(saved);
    const [held] = this.held([saved]);
    if (!held) throw new Error(`CharactersDaoFake lost ${character.id} right after its insert`);
    return held;
  }

  async update(
    characterId: string,
    changes: CharacterChangesPo & CharacterLookChangesPo,
  ): Promise<void> {
    this.journal.push('update');
    this.replace(characterId, (row) => ({ ...row, character: { ...row.character, ...changes } }));
  }

  async setBarValues(barId: string, values: BarValuesPo): Promise<void> {
    this.journal.push('set bar');
    const owner = this.rows.find((row) => row.bars.some(({ id }) => id === barId));
    if (!owner) return;
    const bars = owner.bars.map((bar) => (bar.id === barId ? { ...bar, ...values } : bar));
    this.replace(owner.character.id, (row) => ({ ...row, bars }));
  }

  async setUser(characterId: string, userId: string | null): Promise<void> {
    this.journal.push('set user');
    this.replace(characterId, (row) => ({
      ...row,
      character: { ...row.character, userId },
      holderRole: userId === null ? null : row.holderRole,
    }));
  }

  async setMainSheet(characterId: string, sheetId: string | null): Promise<void> {
    this.journal.push('main sheet');
    this.replace(characterId, (row) => ({
      ...row,
      character: { ...row.character, mainSheetId: sheetId },
    }));
  }

  async replaceBars(characterId: string, bars: readonly CharacterBarInputPo[]): Promise<void> {
    this.journal.push('bars');
    const saved = bars.map((bar, position) => barOf(characterId, bar, position));
    this.replace(characterId, (row) => ({ ...row, bars: saved }));
  }

  async replaceControllers(characterId: string, userIds: readonly string[]): Promise<void> {
    this.journal.push('controllers');
    this.replace(characterId, (row) => ({ ...row, controllerIds: [...new Set(userIds)] }));
  }

  private held(rows: readonly StoredCharacterRow[]): CharacterRow[] {
    return rows.map((row) => ({
      ...row,
      conditions: this.conditions.active.filter((c) => c.characterId === row.character.id),
    }));
  }

  private replace(characterId: string, change: (row: WornCharacterRow) => WornCharacterRow): void {
    const index = this.rows.findIndex((row) => row.character.id === characterId);
    const found = this.rows[index];
    if (found) this.rows[index] = change(found);
  }
}

function barOf(characterId: string, bar: CharacterBarInputPo, position: number): CharacterBarPo {
  return characterBarPo({ ...bar, id: crypto.randomUUID(), characterId, position });
}

/** No sheet at all: what a characters transaction reads when the spec gives it no sheets. */
export class NoSheetsDaoFake implements Pick<SheetsDao, 'find'> {
  async find(): Promise<SheetPo | undefined> {
    return undefined;
  }
}

/** Runs the work on the DAO fakes and writes `commit` after it resolved, like the real one. */
export class CharacterTransactionRunnerFake {
  constructor(
    private readonly characters: CharactersDaoFake,
    private readonly sheets: Pick<SheetsDao, 'find'> = new NoSheetsDaoFake(),
  ) {}

  readonly run: CharacterTransactionRunner = async <T>(
    work: (daos: CharacterWriteDaos) => Promise<T>,
  ): Promise<T> => {
    const result = await work({ characters: this.characters, sheets: this.sheets });
    this.characters.journal.push('commit');
    return result;
  };
}

/** Runs a read on the DAO fake, with nothing to commit. */
export class CharacterSnapshotRunnerFake {
  constructor(private readonly characters: CharactersDaoFake) {}

  readonly run: CharacterSnapshotRunner = async <T>(
    work: (daos: CharacterReadDaos) => Promise<T>,
  ): Promise<T> => work({ characters: this.characters });
}

/** Keeps each change published and writes `publish` to `journal`. */
export class CharacterPublisherFake implements CharacterPublisherPort {
  readonly changes: CharactersChange[] = [];

  constructor(private readonly journal: string[] = []) {}

  charactersChanged(change: CharactersChange): void {
    this.journal.push('publish');
    this.changes.push(change);
  }
}
