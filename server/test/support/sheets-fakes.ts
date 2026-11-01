import type { SheetChangedEventDto } from '@lorkarium/contracts';
import type { CharacterRow } from '../../src/modules/characters/characters.dao';
import { SheetHolderService } from '../../src/modules/sheets/sheet-holder.service';
import type { SheetPublisherPort } from '../../src/modules/sheets/sheet-publisher.port';
import type {
  CharacterPlacePo,
  SheetChangesPo,
  SheetPlacesPo,
  TokenPlacePo,
} from '../../src/modules/sheets/sheets.dao';
import type {
  NewSheetPo,
  SheetActionPo,
  SheetPo,
  SheetValuesPo,
} from '../../src/modules/sheets/sheets.po';
import type { SheetDaos, SheetsServiceDeps } from '../../src/modules/sheets/sheets.service';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from './campaigns-factories';
import { LYRA_CHARACTER_ID, characterPo, characterRow } from './characters-factories';
import { CharacterPublisherFake, CharactersDaoFake } from './characters-fakes';
import { ATO_1_ID, TORRE_ID, sceneFolderPo } from './library-factories';
import {
  LibraryCampaignsDaoFake,
  LibraryPublisherFake,
  SceneFoldersDaoFake,
} from './library-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID } from './scenes-factories';
import { QUELM_TEMPLATE_ID, SheetTemplatesDaoFake, sheetTemplatePo } from './sheet-templates-fakes';
import { BRAM_ID, LOBO_ID, LYRA_ID } from './tokens-factories';

export const LYRA_ANCHOR_ID = '9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e';
export const LYRA_SHEET_ID = 'ab9c8d7e-6f5a-4b4c-9d3e-2f1a0b9c8d7e';
export const QUELM_SHEET_ID = 'bc0d9e8f-7a6b-4c5d-8e4f-3a2b1c0d9e8f';
export const SHEET_ACTION_ID = 'cd1e0f9a-8b7c-4d6e-9f5a-4b3c2d1e0f9a';
export const QUELM_TOKEN_ID = 'de2f1a0b-9c8d-4e7f-8a6b-5c4d3e2f1a0b';
export const KAEL_CHARACTER_ID = 'e3a4b5c6-d7e8-4f9a-8b1c-2d3e4f5a6b7c';
export const MIRA_CHARACTER_ID = 'f4b5c6d7-e8f9-4a0b-9c2d-3e4f5a6b7c8d';
export const QUELM_CHARACTER_ID = 'a5c6d7e8-f9a0-4b1c-8d3e-4f5a6b7c8d9e';

/** "Lyra", the sheet Lyra (Bia's character) holds, run by Ficha Tormenta, at the root, only for
 *  its controllers, version 4. */
export function sheetPo(overrides: Partial<SheetPo> = {}): SheetPo {
  return {
    id: LYRA_SHEET_ID,
    campaignId: VHARN_ID,
    templateId: sheetTemplatePo().id,
    name: 'Lyra',
    folderId: null,
    tokenId: null,
    characterId: LYRA_CHARACTER_ID,
    visibility: 'controllers',
    values: { forca: 14 },
    version: 4,
    createdAt: new Date('2026-10-31T12:00:00Z'),
    updatedAt: new Date('2026-10-31T12:00:00Z'),
    ...overrides,
  };
}

/** The token places of Vharn: Lyra's old anchor in the cast (Bia), Lyra on the Salão linked to
 *  her character, Bram unlinked on the Salão (Caio), the Lobo on the private Torre (Bia). */
export function tablePlaces(): TokenPlacePo[] {
  const salao = { sceneId: VHARN_SCENE_ID, isActive: true } as const;
  const shown = { ...salao, kind: 'grid', visibility: 'public' } as const;
  return [
    {
      ...{ tokenId: LYRA_ANCHOR_ID, characterId: null, sceneId: VHARN_CAST_ID, kind: 'cast' },
      ...{ visibility: 'public', isActive: false, controllerIds: [BIA_ID] },
    },
    { tokenId: LYRA_ID, characterId: LYRA_CHARACTER_ID, ...shown, controllerIds: [BIA_ID] },
    { tokenId: BRAM_ID, characterId: null, ...shown, controllerIds: [CAIO_ID] },
    {
      ...{ tokenId: LOBO_ID, characterId: null, sceneId: TORRE_ID, kind: 'grid' },
      ...{ visibility: 'private', isActive: false, controllerIds: [BIA_ID] },
    },
  ];
}

/** The characters: Lyra of Bia and Kael of Caio (players), Mira of Duda (a spectator, stored)
 *  at Vharn, and Sombra of Caio at Quelm. None has a main sheet yet. */
export function tableCharacters(): CharacterRow[] {
  const kael = characterPo({ id: KAEL_CHARACTER_ID, userId: CAIO_ID, name: 'Kael' });
  const mira = characterPo({ id: MIRA_CHARACTER_ID, userId: DUDA_ID, name: 'Mira' });
  const sombra = characterPo({ id: QUELM_CHARACTER_ID, campaignId: QUELM_ID, userId: CAIO_ID });
  return [
    characterRow(),
    characterRow({ character: kael, bars: [], controllerIds: [CAIO_ID] }),
    characterRow({ character: mira, bars: [], controllerIds: [DUDA_ID], holderRole: 'spectator' }),
    characterRow({ character: sombra, bars: [], controllerIds: [CAIO_ID], holderRole: 'master' }),
  ];
}

/** Lyra as a holder of sheets: Bia's, Bia a player, controlled by her.
 *
 *  Example: `toSheetAccessBo(access, sheetPo(), { character: lyraPlace() })` */
export function lyraPlace(overrides: Partial<CharacterPlacePo> = {}): CharacterPlacePo {
  const place = { characterId: LYRA_CHARACTER_ID, userId: BIA_ID, holderRole: 'player' as const };
  return { ...place, controllerIds: [BIA_ID], ...overrides };
}

type SheetOperations = SheetDaos['sheets'];

/** In-memory sheets, receipts and token places, each per campaign; the character holders come
 *  from the characters fake. Writes go to the journal. */
export class SheetsDaoFake implements SheetOperations {
  rows: SheetPo[] = [];
  actions: SheetActionPo[] = [];
  readonly places = new Map<string, Map<string, TokenPlacePo>>([
    [VHARN_ID, new Map(tablePlaces().map((place) => [place.tokenId, place]))],
  ]);
  constructor(
    private readonly journal: string[],
    private readonly characters: CharactersDaoFake = new CharactersDaoFake(),
  ) {
    const quelmPlace = { ...tablePlaces()[2], tokenId: QUELM_TOKEN_ID } as TokenPlacePo;
    this.places.set(QUELM_ID, new Map([[QUELM_TOKEN_ID, quelmPlace]]));
  }
  async find(campaignId: string, sheetId: string): Promise<SheetPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === sheetId);
  }
  async listOfToken(campaignId: string, tokenId: string): Promise<SheetPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId && row.tokenId === tokenId);
  }
  async listOfCharacter(campaignId: string, characterId: string): Promise<SheetPo[]> {
    return this.rows.filter(
      (row) => row.campaignId === campaignId && row.characterId === characterId,
    );
  }
  async insert(input: NewSheetPo): Promise<SheetPo> {
    this.journal.push('insert');
    const taken = this.rows.some(({ id }) => id === LYRA_SHEET_ID);
    const id = input.id ?? (taken ? crypto.randomUUID() : LYRA_SHEET_ID);
    const row = sheetPo({ ...input, id, folderId: input.folderId ?? null, values: {}, version: 0 });
    row.tokenId = input.tokenId ?? null;
    row.characterId = input.characterId ?? null;
    this.rows.push(row);
    return row;
  }
  async patchValues(
    campaignId: string,
    sheetId: string,
    change: Readonly<{ set: SheetValuesPo; removed: readonly string[]; updatedAt: Date }>,
  ): Promise<SheetPo> {
    this.journal.push('patch values');
    const row = await this.required(campaignId, sheetId);
    const values: SheetValuesPo = { ...row.values, ...change.set };
    for (const key of change.removed) delete values[key];
    return Object.assign(row, { values, version: row.version + 1, updatedAt: change.updatedAt });
  }
  async update(campaignId: string, sheetId: string, changes: SheetChangesPo): Promise<SheetPo> {
    this.journal.push('update');
    return Object.assign(await this.required(campaignId, sheetId), changes);
  }
  async delete(campaignId: string, sheetId: string): Promise<void> {
    this.journal.push('delete');
    this.rows = this.rows.filter((row) => row.campaignId !== campaignId || row.id !== sheetId);
  }
  async placeOf(campaignId: string, tokenId: string): Promise<TokenPlacePo | undefined> {
    return this.places.get(campaignId)?.get(tokenId);
  }
  async placesOf(campaignId: string, tokenIds: readonly string[]): Promise<TokenPlacePo[]> {
    const found = await Promise.all(tokenIds.map((tokenId) => this.placeOf(campaignId, tokenId)));
    return found.filter((place): place is TokenPlacePo => place !== undefined);
  }
  async characterPlacesOf(
    campaignId: string,
    characterIds: readonly string[],
  ): Promise<CharacterPlacePo[]> {
    const rows = await this.characters.findManyInCampaign(campaignId, characterIds);
    return rows.map(placeOfCharacter);
  }
  async characterPlaceOfUser(
    campaignId: string,
    userId: string,
  ): Promise<CharacterPlacePo | undefined> {
    const row = await this.characters.findOfUser(campaignId, userId);
    return row && placeOfCharacter(row);
  }
  async holdersOf(campaignId: string, sheets: readonly SheetPo[]): Promise<SheetPlacesPo> {
    const tokenIds = sheets.flatMap(({ tokenId }) => (tokenId ? [tokenId] : []));
    const characterIds = sheets.flatMap(({ characterId }) => (characterId ? [characterId] : []));
    return {
      tokens: await this.placesOf(campaignId, tokenIds),
      characters: await this.characterPlacesOf(campaignId, characterIds),
    };
  }
  async action(
    campaignId: string,
    userId: string,
    actionId: string,
  ): Promise<SheetActionPo | undefined> {
    return this.actions.find(
      (row) => row.campaignId === campaignId && row.userId === userId && row.actionId === actionId,
    );
  }
  async recordAction(row: SheetActionPo): Promise<void> {
    this.journal.push('receipt');
    this.actions.push(row);
  }
  private async required(campaignId: string, sheetId: string): Promise<SheetPo> {
    const row = await this.find(campaignId, sheetId);
    if (!row) throw new Error(`Missing sheet ${sheetId}`);
    return row;
  }
}

function placeOfCharacter(row: CharacterRow): CharacterPlacePo {
  const { id: characterId, userId } = row.character;
  return { characterId, userId, holderRole: row.holderRole, controllerIds: row.controllerIds };
}

/** Records each `sheet:changed` and writes 'publish sheet' to the journal. */
export class SheetPublisherFake implements SheetPublisherPort {
  readonly events: SheetChangedEventDto[] = [];
  constructor(private readonly journal: string[]) {}
  sheetChanged(event: SheetChangedEventDto): void {
    this.events.push(event);
    this.journal.push('publish sheet');
  }
}

/** Ana masters Vharn, Bia and Caio play (Lyra and Kael), Duda watches (Mira, stored); the
 *  characters' version of Vharn is 4. Vharn has Ficha Tormenta and the folder Ato 1; Quelm its
 *  own template and the sheet of its token. The characters fake writes `lock characters`,
 *  `main sheet` and `bump characters` to `journal`; its publisher `publish` after the library's. */
export class SheetsHarness {
  readonly journal: string[] = [];
  readonly characters = new CharactersDaoFake(this.journal, tableCharacters(), {
    [VHARN_ID]: 4,
    [QUELM_ID]: 1,
  });
  readonly sheets = new SheetsDaoFake(this.journal, this.characters);
  readonly publisher = new SheetPublisherFake(this.journal);
  readonly characterPublisher = new CharacterPublisherFake(this.journal);
  readonly library = new LibraryPublisherFake(this.journal);
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ userId: ANA_ID, role: 'master', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: BIA_ID, role: 'player', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator', campaignId: VHARN_ID }),
  ]);
  readonly daos: SheetDaos = {
    campaigns: new LibraryCampaignsDaoFake(this.journal, [campaignPo({ id: VHARN_ID })]),
    members: this.members,
    sheets: this.sheets,
    templates: new SheetTemplatesDaoFake(this.journal, [
      sheetTemplatePo({ version: 2 }),
      sheetTemplatePo({ id: QUELM_TEMPLATE_ID, campaignId: QUELM_ID }),
    ]),
    folders: new SceneFoldersDaoFake(this.journal, [sceneFolderPo({ id: ATO_1_ID })]),
    characters: this.characters,
  };
  failCommit = false;
  readonly clock = new ClockFake(new Date('2026-10-31T15:00:00Z'));
  readonly deps: SheetsServiceDeps = {
    read: this.daos,
    snapshot: (work) => work(this.daos),
    transaction: (work) => this.inTransaction(work),
    clock: this.clock,
    publisher: this.publisher,
    library: this.library,
    characterPublisher: this.characterPublisher,
    holders: new SheetHolderService(),
  };
  constructor() {
    const quelm = { id: QUELM_SHEET_ID, campaignId: QUELM_ID, characterId: null };
    this.sheets.rows.push(sheetPo({ ...quelm, tokenId: QUELM_TOKEN_ID }));
  }
  as(userId: string): { campaignId: string; userId: string } {
    return { campaignId: VHARN_ID, userId };
  }
  /** Lyra's sheet with `overrides`. */
  withLyraSheet(overrides: Partial<SheetPo> = {}): this {
    this.sheets.rows.push(sheetPo(overrides));
    return this;
  }
  /** The main sheet of a character, as if saved before. */
  withMainSheet(characterId: string, sheetId: string): this {
    const row = this.characters.rows.find(({ character }) => character.id === characterId);
    if (row) Object.assign(row.character, { mainSheetId: sheetId });
    return this;
  }
  mainSheetOf(characterId: string): string | null | undefined {
    return this.characters.rows.find(({ character }) => character.id === characterId)?.character
      .mainSheetId;
  }
  private async inTransaction<T>(work: (daos: SheetDaos) => Promise<T>): Promise<T> {
    const saved = structuredClone({ rows: this.sheets.rows, actions: this.sheets.actions });
    const characters = structuredClone(this.characters.rows);
    try {
      const result = await work(this.daos);
      if (this.failCommit) throw new Error('commit failed');
      this.journal.push('commit');
      return result;
    } catch (error) {
      Object.assign(this.sheets, saved);
      this.characters.rows.splice(0, this.characters.rows.length, ...characters);
      throw error;
    }
  }
}
