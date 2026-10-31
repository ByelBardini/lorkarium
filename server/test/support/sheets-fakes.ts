import type { SheetChangedEventDto } from '@lorkarium/contracts';
import { SheetHolderService } from '../../src/modules/sheets/sheet-holder.service';
import type { SheetPublisherPort } from '../../src/modules/sheets/sheet-publisher.port';
import type { SheetChangesPo, TokenPlacePo } from '../../src/modules/sheets/sheets.dao';
import type {
  NewSheetPo,
  SheetActionPo,
  SheetPo,
  SheetValuesPo,
} from '../../src/modules/sheets/sheets.po';
import type { SheetDaos, SheetsServiceDeps } from '../../src/modules/sheets/sheets.service';
import { ClockFake, UsersDaoFake } from './auth-fakes';
import { ANA_ID, userPo } from './auth-factories';
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
import { ATO_1_ID, TORRE_ID, sceneFolderPo } from './library-factories';
import {
  LibraryCampaignsDaoFake,
  LibraryPublisherFake,
  SceneFoldersDaoFake,
} from './library-fakes';
import { MemberCardsDaoFake } from './member-cards-fakes';
import { memberCardPo } from './member-cards-factories';
import { BoardPublisherFake, ScenesDaoFake } from './scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from './scenes-factories';
import { QUELM_TEMPLATE_ID, SheetTemplatesDaoFake, sheetTemplatePo } from './sheet-templates-fakes';
import { TokensDaoFake } from './tokens-fakes';
import { BRAM_ID, LOBO_ID, LYRA_ID } from './tokens-factories';

export const LYRA_ANCHOR_ID = '9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e';
export const LYRA_SHEET_ID = 'ab9c8d7e-6f5a-4b4c-9d3e-2f1a0b9c8d7e';
export const QUELM_SHEET_ID = 'bc0d9e8f-7a6b-4c5d-8e4f-3a2b1c0d9e8f';
export const SHEET_ACTION_ID = 'cd1e0f9a-8b7c-4d6e-9f5a-4b3c2d1e0f9a';
export const QUELM_TOKEN_ID = 'de2f1a0b-9c8d-4e7f-8a6b-5c4d3e2f1a0b';

/** "Lyra", the sheet of Lyra's anchor, run by Ficha Tormenta, at the root, only for its
 *  controllers, version 4. */
export function sheetPo(overrides: Partial<SheetPo> = {}): SheetPo {
  return {
    id: LYRA_SHEET_ID,
    campaignId: VHARN_ID,
    templateId: sheetTemplatePo().id,
    name: 'Lyra',
    folderId: null,
    tokenId: LYRA_ANCHOR_ID,
    visibility: 'controllers',
    values: { forca: 14 },
    version: 4,
    createdAt: new Date('2026-10-31T12:00:00Z'),
    updatedAt: new Date('2026-10-31T12:00:00Z'),
    ...overrides,
  };
}

/** The places of Vharn: Lyra's anchor in the cast (Bia's character, she controls it), Lyra on the
 *  Salão linked to it, Bram unlinked on the Salão (Caio), the Lobo on the private Torre (Bia). */
export function tablePlaces(): TokenPlacePo[] {
  const grid = { kind: 'grid', visibility: 'public', isActive: true, memberId: null } as const;
  return [
    {
      ...{ tokenId: LYRA_ANCHOR_ID, anchorTokenId: null, sceneId: VHARN_CAST_ID, kind: 'cast' },
      ...{ visibility: 'public', isActive: false, controllerIds: [BIA_ID], memberId: BIA_ID },
    },
    {
      ...{ tokenId: LYRA_ID, anchorTokenId: LYRA_ANCHOR_ID, sceneId: VHARN_SCENE_ID },
      ...{ ...grid, controllerIds: [BIA_ID] },
    },
    {
      ...{ tokenId: BRAM_ID, anchorTokenId: null, sceneId: VHARN_SCENE_ID },
      ...{ ...grid, controllerIds: [CAIO_ID] },
    },
    {
      ...{ tokenId: LOBO_ID, anchorTokenId: null, sceneId: TORRE_ID, kind: 'grid' },
      ...{ visibility: 'private', isActive: false, controllerIds: [BIA_ID], memberId: null },
    },
  ];
}

type SheetOperations = SheetDaos['sheets'];

/** In-memory sheets, receipts and token places, each per campaign; writes go to the journal. A
 *  token the `tokens` fake inserted in the cast (a new anchor) stands there, as the member whose
 *  card points at it. */
export class SheetsDaoFake implements SheetOperations {
  rows: SheetPo[] = [];
  actions: SheetActionPo[] = [];
  readonly places = new Map<string, Map<string, TokenPlacePo>>([
    [VHARN_ID, new Map(tablePlaces().map((place) => [place.tokenId, place]))],
  ]);
  constructor(
    private readonly journal: string[],
    private readonly anchors?: Readonly<{ tokens: TokensDaoFake; cards: MemberCardsDaoFake }>,
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
  async insert(input: NewSheetPo): Promise<SheetPo> {
    this.journal.push('insert');
    const taken = this.rows.some(({ id }) => id === LYRA_SHEET_ID);
    const id = input.id ?? (taken ? crypto.randomUUID() : LYRA_SHEET_ID);
    const row = sheetPo({ ...input, id, folderId: input.folderId ?? null, values: {}, version: 0 });
    row.tokenId = input.tokenId ?? null;
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
    return (
      this.places.get(campaignId)?.get(tokenId) ?? (await this.anchorPlaceOf(campaignId, tokenId))
    );
  }
  async placesOf(campaignId: string, tokenIds: readonly string[]): Promise<TokenPlacePo[]> {
    const found = await Promise.all(tokenIds.map((tokenId) => this.placeOf(campaignId, tokenId)));
    return found.filter((place): place is TokenPlacePo => place !== undefined);
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
  private async anchorPlaceOf(
    campaignId: string,
    tokenId: string,
  ): Promise<TokenPlacePo | undefined> {
    if (campaignId !== VHARN_ID || !this.anchors) return undefined;
    const row = this.anchors.tokens.rows.find(({ token }) => token.id === tokenId);
    if (!row || row.token.sceneId !== VHARN_CAST_ID) return undefined;
    const card = this.anchors.cards.rows.find((each) => each.anchorTokenId === tokenId);
    const { controllerIds } = row;
    const cast = {
      sceneId: VHARN_CAST_ID,
      kind: 'cast',
      visibility: 'public',
      isActive: false,
    } as const;
    return { tokenId, anchorTokenId: null, ...cast, controllerIds, memberId: card?.userId ?? null };
  }
  private async required(campaignId: string, sheetId: string): Promise<SheetPo> {
    const row = await this.find(campaignId, sheetId);
    if (!row) throw new Error(`Missing sheet ${sheetId}`);
    return row;
  }
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

/** Ana masters Vharn, Bia and Caio play, Duda watches; Bia's card anchors on Lyra's anchor, Caio
 *  has no card yet ("Kael" once he writes one). Vharn has Ficha Tormenta and the folder Ato 1;
 *  Quelm its own template and the sheet of its token. The cast and the tokens fakes write their
 *  own journal (`scenes.journal`); the tokens, cards and publishers write `journal`. */
export class SheetsHarness {
  readonly journal: string[] = [];
  readonly scenes = new ScenesDaoFake([scenePo(), castPo()]);
  readonly tokens = new TokensDaoFake(this.journal);
  readonly cards = new MemberCardsDaoFake(this.journal, [
    memberCardPo({ userId: BIA_ID, characterName: 'Lyra', anchorTokenId: LYRA_ANCHOR_ID }),
  ]);
  readonly sheets = new SheetsDaoFake(this.journal, { tokens: this.tokens, cards: this.cards });
  readonly publisher = new SheetPublisherFake(this.journal);
  readonly board = new BoardPublisherFake(this.journal);
  readonly library = new LibraryPublisherFake(this.journal);
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ userId: ANA_ID, role: 'master', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: BIA_ID, role: 'player', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator', campaignId: VHARN_ID }),
  ]);
  readonly users = new UsersDaoFake([
    userPo({ id: BIA_ID, name: 'Bia', email: 'bia@mesa.com' }),
    userPo({ id: CAIO_ID, name: 'Caio', email: 'caio@mesa.com' }),
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
    scenes: this.scenes,
    tokens: this.tokens,
    memberCards: this.cards,
    users: this.users,
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
    holders: new SheetHolderService({ publisher: this.board, clock: this.clock }),
  };
  constructor() {
    this.sheets.rows.push(
      sheetPo({ id: QUELM_SHEET_ID, campaignId: QUELM_ID, tokenId: QUELM_TOKEN_ID }),
    );
  }
  as(userId: string): { campaignId: string; userId: string } {
    return { campaignId: VHARN_ID, userId };
  }
  /** Lyra's sheet with `overrides`. */
  withLyraSheet(overrides: Partial<SheetPo> = {}): this {
    this.sheets.rows.push(sheetPo(overrides));
    return this;
  }
  private async inTransaction<T>(work: (daos: SheetDaos) => Promise<T>): Promise<T> {
    const saved = structuredClone({ rows: this.sheets.rows, actions: this.sheets.actions });
    try {
      const result = await work(this.daos);
      if (this.failCommit) throw new Error('commit failed');
      this.journal.push('commit');
      return result;
    } catch (error) {
      Object.assign(this.sheets, saved);
      throw error;
    }
  }
}
