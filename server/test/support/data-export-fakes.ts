import type { CustomEmojiPo } from '../../src/modules/custom-emojis/custom-emoji.po';
import type { FeedbackEntryPo } from '../../src/modules/feedback/feedback-entries.po';
import { Readable } from 'node:stream';
import type { ReputationCounts } from '../../src/modules/reputation/reputation.bo';
import type { SavedColorPo } from '../../src/modules/saved-colors/saved-colors.po';
import type {
  AccountExportDao,
  ExportedAccountRow,
  ExportedSessionRow,
  GivenVoteRow,
  HeldBadgeRow,
  RelatedAccountRow,
} from '../../src/modules/data-export/account-export.dao';
import type {
  ArchiveEntries,
  ArchiveWriterPort,
} from '../../src/modules/data-export/archive-writer.port';
import type {
  CampaignExportDao,
  MembershipRow,
  OwnBarRow,
  OwnCharacterRow,
  OwnDocumentRow,
  OwnSavedRollRow,
  OwnSheetRow,
  ReadableTabRow,
  SentAssetRow,
} from '../../src/modules/data-export/campaign-export.dao';
import type { DataExportParts } from '../../src/modules/data-export/data-export.mapper';
import type { ExportImageLog } from '../../src/modules/data-export/data-export.service';
import type {
  MadeReportRow,
  ModerationExportDao,
  ReceivedSanctionRow,
} from '../../src/modules/data-export/moderation-export.dao';
import { ANA_ID, userPo } from './auth-factories';

export const BIA_AVATAR_ID = '0b3f2d4e-1111-4c1a-9d2e-00000000a001';
export const BIA_BANNER_ID = '0b3f2d4e-1111-4c1a-9d2e-00000000a002';
export const BIA_TEXTURE_ID = '0b3f2d4e-1111-4c1a-9d2e-00000000a003';
export const VHARN_ID = '7a2c0e55-2222-4b7d-8f10-00000000c001';
export const MAP_ASSET_ID = '7a2c0e55-2222-4b7d-8f10-00000000d001';

/** The account row of `ana@mesa.com` as the export reads it (a whole `UserPo`, password hash and
 *  blind index included, so a spec can prove they never reach the JSON).
 *
 *  Example: `exportedAccountRow({ avatarId: BIA_AVATAR_ID })` */
export function exportedAccountRow(
  overrides: Partial<ExportedAccountRow> = {},
): ExportedAccountRow {
  return { ...userPo({ email: 'ana@mesa.com' }), ...overrides };
}

/** An image Ana sent to Vharn. */
export function sentAssetRow(overrides: Partial<SentAssetRow> = {}): SentAssetRow {
  return {
    id: MAP_ASSET_ID,
    campaignId: VHARN_ID,
    purpose: 'library_map',
    mimeType: 'image/png',
    sizeBytes: 2048,
    storageKey: `campaigns/${VHARN_ID}/${MAP_ASSET_ID}`,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    ...overrides,
  };
}

/** Every part empty, the account Ana's, nobody voted on her. */
export function emptyExportParts(overrides: Partial<DataExportParts> = {}): DataExportParts {
  return {
    account: exportedAccountRow(),
    twoFactorEnabledAt: null,
    sessions: [],
    savedColors: [],
    customEmojis: [],
    friends: [],
    requestsSent: [],
    requestsReceived: [],
    blocks: [],
    votesGiven: [],
    reputationReceived: { up: 0, down: 0, myVote: null, percent: null },
    reportsMade: [],
    sanctions: [],
    feedbackSent: [],
    badges: [],
    memberships: [],
    characters: [],
    bars: [],
    sheets: [],
    documents: [],
    tabs: [],
    savedRolls: [],
    assets: [],
    ...overrides,
  };
}

/** Answers each read with its field; records the claims and how many times the account was read. */
export class AccountExportDaoFake implements Pick<AccountExportDao, keyof AccountExportDao> {
  account: ExportedAccountRow | undefined = exportedAccountRow();
  /** What `lastExportOf` answers, in order; the last one repeats. */
  lastExports: (Date | null)[] = [null];
  claimAnswer = true;
  readonly claims: Readonly<{ userId: string; now: Date; latestAllowed: Date }>[] = [];
  accountReads = 0;
  twoFactor: Date | null = null;
  sessions: ExportedSessionRow[] = [];
  savedColors: SavedColorPo[] = [];
  customEmojis: CustomEmojiPo[] = [];
  friends: RelatedAccountRow[] = [];
  sent: RelatedAccountRow[] = [];
  received: RelatedAccountRow[] = [];
  blocks: RelatedAccountRow[] = [];
  votes: GivenVoteRow[] = [];
  badges: HeldBadgeRow[] = [];

  async accountOf(): Promise<ExportedAccountRow | undefined> {
    this.accountReads += 1;
    return this.account;
  }

  async lastExportOf(): Promise<Date | null> {
    return this.lastExports.length > 1
      ? (this.lastExports.shift() ?? null)
      : (this.lastExports[0] ?? null);
  }

  async claimExport(userId: string, now: Date, latestAllowed: Date): Promise<boolean> {
    this.claims.push({ userId, now, latestAllowed });
    return this.claimAnswer;
  }

  async twoFactorEnabledAt(): Promise<Date | null> {
    return this.twoFactor;
  }
  async sessionsOf(): Promise<ExportedSessionRow[]> {
    return this.sessions;
  }
  async customEmojisOf(): Promise<CustomEmojiPo[]> {
    return this.customEmojis;
  }

  async savedColorsOf(): Promise<SavedColorPo[]> {
    return this.savedColors;
  }
  async friendsOf(): Promise<RelatedAccountRow[]> {
    return this.friends;
  }
  async requestsSentBy(): Promise<RelatedAccountRow[]> {
    return this.sent;
  }
  async requestsReceivedBy(): Promise<RelatedAccountRow[]> {
    return this.received;
  }
  async blocksBy(): Promise<RelatedAccountRow[]> {
    return this.blocks;
  }
  async votesGivenBy(): Promise<GivenVoteRow[]> {
    return this.votes;
  }
  async badgesOf(): Promise<HeldBadgeRow[]> {
    return this.badges;
  }
}

/** Answers each read of the tables with its field; records the ids the bars and tabs were asked for. */
export class CampaignExportDaoFake implements Pick<CampaignExportDao, keyof CampaignExportDao> {
  memberships: MembershipRow[] = [];
  characters: OwnCharacterRow[] = [];
  bars: OwnBarRow[] = [];
  sheets: OwnSheetRow[] = [];
  documents: OwnDocumentRow[] = [];
  tabs: ReadableTabRow[] = [];
  savedRolls: OwnSavedRollRow[] = [];
  assets: SentAssetRow[] = [];

  async membershipsOf(): Promise<MembershipRow[]> {
    return this.memberships;
  }
  async charactersOf(): Promise<OwnCharacterRow[]> {
    return this.characters;
  }
  async barsOf(): Promise<OwnBarRow[]> {
    return this.bars;
  }
  async sheetsOf(): Promise<OwnSheetRow[]> {
    return this.sheets;
  }
  async documentsOf(): Promise<OwnDocumentRow[]> {
    return this.documents;
  }
  async readableTabsOf(): Promise<ReadableTabRow[]> {
    return this.tabs;
  }
  async savedRollsOf(): Promise<OwnSavedRollRow[]> {
    return this.savedRolls;
  }
  async assetsSentBy(): Promise<SentAssetRow[]> {
    return this.assets;
  }
}

export class ModerationExportDaoFake implements Pick<
  ModerationExportDao,
  keyof ModerationExportDao
> {
  reports: MadeReportRow[] = [];
  sanctions: ReceivedSanctionRow[] = [];
  feedback: FeedbackEntryPo[] = [];

  async reportsMadeBy(): Promise<MadeReportRow[]> {
    return this.reports;
  }
  async sanctionsOf(): Promise<ReceivedSanctionRow[]> {
    return this.sanctions;
  }
  async feedbackSentBy(): Promise<FeedbackEntryPo[]> {
    return this.feedback;
  }
}

/** The votes on the account as `ReputationDao.countsFor` sums them; records who was asked. */
export class ReputationCountsFake {
  counts: ReputationCounts = { up: 0, down: 0, myVote: null };
  readonly asked: Readonly<{ targetId: string; viewerId: string }>[] = [];

  async countsFor(targetId: string, viewerId: string): Promise<ReputationCounts> {
    this.asked.push({ targetId, viewerId });
    return this.counts;
  }
}

/** Keeps every entry in memory, in the order added; `finished` settles when the fill does. */
export class ArchiveWriterFake implements ArchiveWriterPort {
  readonly files = new Map<string, Uint8Array>();
  finished: Promise<void> = Promise.resolve();

  stream(fill: (entries: ArchiveEntries) => Promise<void>): Readable {
    this.finished = fill(this.entries());
    return Readable.from([]);
  }

  /** The text of one entry, `undefined` when the archive has no such path. */
  textOf(path: string): string | undefined {
    const bytes = this.files.get(path);
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  }

  private entries(): ArchiveEntries {
    return {
      addFile: async (path, bytes) => void this.files.set(path, bytes),
      addStream: async (path, body) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
        this.files.set(path, new Uint8Array(Buffer.concat(chunks)));
      },
    };
  }
}

/** Records every warning (an image the storage could not open). */
export class ExportImageLogFake implements ExportImageLog {
  readonly warnings: Readonly<{ fields: object; message: string }>[] = [];

  warn(fields: object, message: string): void {
    this.warnings.push({ fields, message });
  }
}

export { ANA_ID };
