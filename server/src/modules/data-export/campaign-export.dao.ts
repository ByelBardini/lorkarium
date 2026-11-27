import { and, asc, eq, exists, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo } from '../assets/assets.po';
import { campaignMembers, type CampaignMemberPo } from '../campaigns/campaign-members.po';
import { campaigns, type CampaignPo } from '../campaigns/campaigns.po';
import {
  characterBars,
  characters,
  type CharacterBarPo,
  type CharacterPo,
} from '../characters/characters.po';
import { libraryDocumentTabs } from '../documents/document-tabs.po';
import {
  libraryDocumentOwners,
  libraryDocuments,
  type DocumentPo,
} from '../documents/documents.po';
import { savedRollFolders, savedRolls, type SavedRollPo } from '../saved-rolls/saved-rolls.po';
import {
  savedTokenFolders,
  savedTokenForms,
  savedTokens,
  type SavedTokenRow,
} from '../saved-tokens/saved-tokens.po';
import { sheetTemplates } from '../sheets/sheet-templates.po';
import { tokenSheets, type SheetPo } from '../sheets/sheets.po';

export type MembershipRow = Pick<CampaignPo, 'name' | 'system'> &
  Pick<CampaignMemberPo, 'campaignId' | 'role' | 'joinedAt' | 'lastEnteredAt'> &
  Readonly<{ owner: boolean }>;
export type OwnCharacterRow = Pick<
  CharacterPo,
  | 'id'
  | 'campaignId'
  | 'name'
  | 'initials'
  | 'side'
  | 'armorClass'
  | 'difficultyClass'
  | 'noteOne'
  | 'noteTwo'
  | 'defeated'
  | 'createdAt'
  | 'updatedAt'
>;
export type OwnBarRow = Pick<CharacterBarPo, 'characterId' | 'label' | 'current' | 'max' | 'temp'>;
export type OwnSheetRow = Pick<
  SheetPo,
  'campaignId' | 'name' | 'values' | 'createdAt' | 'updatedAt'
> &
  Readonly<{ template: string }>;
export type OwnDocumentRow = Pick<
  DocumentPo,
  'id' | 'campaignId' | 'name' | 'previewSummary' | 'createdAt' | 'updatedAt'
>;
export type ReadableTabRow = Readonly<{ documentId: string; name: string; content: unknown }>;
export type OwnSavedRollRow = Pick<
  SavedRollPo,
  'campaignId' | 'name' | 'parts' | 'createdAt' | 'updatedAt'
> &
  Readonly<{ folder: string | null }>;
/** A saved token of the person with the name of its folder (`null` = out of any). */
export type OwnSavedTokenRow = SavedTokenRow & Readonly<{ folder: string | null }>;
export type SentAssetRow = Pick<
  AssetPo,
  'id' | 'campaignId' | 'purpose' | 'mimeType' | 'sizeBytes' | 'storageKey' | 'createdAt'
>;

/** The seat of `userId` at the row's table: every query below joins it, so nothing comes from a
 *  table the person is not at (spec §2.6), even what they left behind there. */
function seatAt(campaignId: AnyPgColumn, userId: string): SQL | undefined {
  return and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId));
}

/** What the export reads of the tables the person sits at: seats, own characters, sheets,
 *  documents, saved rolls and the images they sent.
 *
 *  Example: `await new CampaignExportDao(db).membershipsOf(biaId) // [{ name: 'Vharn', … }]` */
export class CampaignExportDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async membershipsOf(userId: string): Promise<MembershipRow[]> {
    const { campaignId, role, joinedAt, lastEnteredAt } = campaignMembers;
    const owner = sql<boolean>`${campaigns.ownerId} = ${userId}`;
    return this.db
      .select({
        campaignId,
        name: campaigns.name,
        system: campaigns.system,
        role,
        joinedAt,
        lastEnteredAt,
        owner,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(eq(campaignMembers.userId, userId))
      .orderBy(asc(campaignMembers.joinedAt));
  }

  async charactersOf(userId: string): Promise<OwnCharacterRow[]> {
    const c = characters;
    return this.db
      .select({
        id: c.id,
        campaignId: c.campaignId,
        name: c.name,
        initials: c.initials,
        side: c.side,
        armorClass: c.armorClass,
        difficultyClass: c.difficultyClass,
        noteOne: c.noteOne,
        noteTwo: c.noteTwo,
        defeated: c.defeated,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
      .from(characters)
      .innerJoin(campaignMembers, seatAt(characters.campaignId, userId))
      .where(eq(characters.userId, userId))
      .orderBy(asc(characters.createdAt));
  }

  /** The bars of characters already read by `charactersOf` (the ids come from there). */
  async barsOf(characterIds: readonly string[]): Promise<OwnBarRow[]> {
    if (characterIds.length === 0) return [];
    const { characterId, label, current, max, temp } = characterBars;
    return this.db
      .select({ characterId, label, current, max, temp })
      .from(characterBars)
      .where(inArray(characterBars.characterId, [...characterIds]))
      .orderBy(asc(characterBars.characterId), asc(characterBars.position));
  }

  /** The sheets the person's own characters hold, with the name of their template. */
  async sheetsOf(userId: string): Promise<OwnSheetRow[]> {
    const s = tokenSheets;
    const heldByOwnCharacter = and(
      eq(characters.campaignId, s.campaignId),
      eq(characters.id, s.characterId),
      eq(characters.userId, userId),
    );
    const ofTemplate = and(
      eq(sheetTemplates.campaignId, s.campaignId),
      eq(sheetTemplates.id, s.templateId),
    );
    return this.db
      .select({
        campaignId: s.campaignId,
        name: s.name,
        template: sheetTemplates.name,
        values: s.values,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
      .from(tokenSheets)
      .innerJoin(characters, heldByOwnCharacter)
      .innerJoin(campaignMembers, seatAt(s.campaignId, userId))
      .innerJoin(sheetTemplates, ofTemplate)
      .orderBy(asc(s.createdAt));
  }

  /** The documents the person owns (a player picked as owner) or wrote, at a table they sit at. */
  async documentsOf(userId: string): Promise<OwnDocumentRow[]> {
    const d = libraryDocuments;
    const owned = exists(
      this.db
        .select({ one: sql`1` })
        .from(libraryDocumentOwners)
        .where(
          and(
            eq(libraryDocumentOwners.campaignId, d.campaignId),
            eq(libraryDocumentOwners.documentId, d.id),
            eq(libraryDocumentOwners.userId, userId),
          ),
        ),
    );
    return this.db
      .select({
        id: d.id,
        campaignId: d.campaignId,
        name: d.name,
        previewSummary: d.previewSummary,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })
      .from(libraryDocuments)
      .innerJoin(campaignMembers, seatAt(d.campaignId, userId))
      .where(or(owned, eq(d.createdBy, userId)))
      .orderBy(asc(d.createdAt));
  }

  /** The tabs of those documents the person reads: a masters-only tab only from a master's seat,
   *  as the documents module shows them. */
  async readableTabsOf(userId: string, documentIds: readonly string[]): Promise<ReadableTabRow[]> {
    if (documentIds.length === 0) return [];
    const t = libraryDocumentTabs;
    const readable = or(eq(t.visibility, 'document'), eq(campaignMembers.role, 'master'));
    return this.db
      .select({ documentId: t.documentId, name: t.name, content: t.content })
      .from(libraryDocumentTabs)
      .innerJoin(campaignMembers, seatAt(t.campaignId, userId))
      .where(and(inArray(t.documentId, [...documentIds]), readable))
      .orderBy(asc(t.documentId), asc(t.position));
  }

  async savedRollsOf(userId: string): Promise<OwnSavedRollRow[]> {
    const r = savedRolls;
    return this.db
      .select({
        campaignId: r.campaignId,
        folder: savedRollFolders.name,
        name: r.name,
        parts: r.parts,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
      .from(savedRolls)
      .leftJoin(savedRollFolders, eq(savedRollFolders.id, r.folderId))
      .where(eq(r.userId, userId))
      .orderBy(asc(r.campaignId), asc(r.name));
  }

  /** The person's saved tokens at every table, with their forms in order: the key to the
   *  membership takes them along when they leave, so only tables they sit at remain.
   *
   *  Example: `await dao.savedTokensOf(biaId) // [{ savedToken, forms, folder: 'Mortos' }]` */
  async savedTokensOf(userId: string): Promise<OwnSavedTokenRow[]> {
    const rows = await this.db
      .select({ savedToken: savedTokens, folder: savedTokenFolders.name })
      .from(savedTokens)
      .leftJoin(savedTokenFolders, eq(savedTokenFolders.id, savedTokens.folderId))
      .where(eq(savedTokens.userId, userId))
      .orderBy(asc(savedTokens.campaignId), asc(savedTokens.createdAt), asc(savedTokens.id));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.savedToken.id);
    const forms = await this.db
      .select()
      .from(savedTokenForms)
      .where(inArray(savedTokenForms.savedTokenId, ids))
      .orderBy(asc(savedTokenForms.position));
    return rows.map((row) => ({
      ...row,
      forms: forms.filter((form) => form.savedTokenId === row.savedToken.id),
    }));
  }

  /** The images (and template fonts) the person sent to a table they still sit at. */
  async assetsSentBy(userId: string): Promise<SentAssetRow[]> {
    const a = assets;
    return this.db
      .select({
        id: a.id,
        campaignId: a.campaignId,
        purpose: a.purpose,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
        createdAt: a.createdAt,
      })
      .from(assets)
      .innerJoin(campaignMembers, seatAt(a.campaignId, userId))
      .where(eq(a.ownerId, userId))
      .orderBy(asc(a.campaignId), asc(a.createdAt));
  }
}
