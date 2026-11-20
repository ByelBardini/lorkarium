import type { Readable } from 'node:stream';
import type { DataExportDto } from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import { summarizeReputation } from '../reputation/reputation.bo';
import type { ReputationDao } from '../reputation/reputation.dao';
import type { AccountExportDao } from './account-export.dao';
import type { ArchiveEntries, ArchiveWriterPort } from './archive-writer.port';
import type { CampaignExportDao } from './campaign-export.dao';
import type { DataExportBo } from './data-export.bo';
import {
  profileImagesOf,
  sentImageOf,
  toDataExportDto,
  type ArchiveImage,
  type DataExportParts,
} from './data-export.mapper';
import { exportFileNameOf, exportReadmeOf } from './export-readme.mapper';
import type { ModerationExportDao } from './moderation-export.dao';

/** The slice of the pino logger an unreadable image is reported to. */
export type ExportImageLog = Readonly<{ warn: (fields: object, message: string) => void }>;

export type DataExportServiceDeps = Readonly<{
  accounts: Pick<AccountExportDao, keyof AccountExportDao>;
  tables: Pick<CampaignExportDao, keyof CampaignExportDao>;
  moderation: Pick<ModerationExportDao, keyof ModerationExportDao>;
  reputation: Pick<ReputationDao, 'countsFor'>;
  storage: Pick<AssetStoragePort, 'open'>;
  archives: ArchiveWriterPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  rule: DataExportBo;
  minVotes: number;
  log: ExportImageLog;
}>;

/** The archive to send: the name the browser saves it under and its bytes, made as they leave. */
export type DataExportFile = Readonly<{ fileName: string; body: Readable }>;

type ArchivePlan = Readonly<{
  dto: DataExportDto;
  images: readonly ArchiveImage[];
  username: string;
  exportedAt: Date;
}>;

type ContactPart =
  | 'twoFactorEnabledAt'
  | 'sessions'
  | 'savedColors'
  | 'friends'
  | 'requestsSent'
  | 'requestsReceived';
type StandingPart =
  | 'blocks'
  | 'votesGiven'
  | 'reputationReceived'
  | 'badges'
  | 'reportsMade'
  | 'sanctions'
  | 'feedbackSent';
type TablePart =
  'memberships' | 'characters' | 'bars' | 'sheets' | 'documents' | 'tabs' | 'savedRolls' | 'assets';

const encoder = new TextEncoder();

/** The export of an account's own data (LGPD art. 18 and 19): `dados.json`, the images and a
 *  `LEIA-ME.txt`, once per interval. The account is always the session's.
 *
 *  Example: `const { fileName, body } = await service.export(biaId)` */
export class DataExportService {
  constructor(private readonly deps: DataExportServiceDeps) {}

  /** Refuses within the interval (`EXPORT_TOO_SOON`), reads everything, marks the export and
   *  only then starts the archive: a refusal never costs the reads of a whole account. */
  async export(userId: string): Promise<DataExportFile> {
    const { accounts, rule, clock } = this.deps;
    const now = clock.now();
    rule.requireAllowed(userId, await accounts.lastExportOf(userId), now);
    const parts = await this.partsOf(userId);
    await this.claim(userId, now);
    const plan = this.planOf(parts, now);
    const body = this.deps.archives.stream((zip) => this.fill(zip, plan));
    return { fileName: exportFileNameOf(parts.account.username, now), body };
  }

  private planOf(parts: DataExportParts, now: Date): ArchivePlan {
    return {
      dto: toDataExportDto(parts, this.deps.cipher, now),
      images: [...profileImagesOf(parts.account), ...parts.assets.map(sentImageOf)],
      username: parts.account.username,
      exportedAt: now,
    };
  }

  /** Two exports at once both pass the first check; the conditional UPDATE lets only one out. */
  private async claim(userId: string, now: Date): Promise<void> {
    const { accounts, rule } = this.deps;
    if (await accounts.claimExport(userId, now, rule.latestLastExportAllowedAt(now))) return;
    rule.requireAllowed(userId, await accounts.lastExportOf(userId), now);
    throw new Error(`account ${userId} vanished during its export: expected the session's account`);
  }

  private async partsOf(userId: string): Promise<DataExportParts> {
    const account = await this.deps.accounts.accountOf(userId);
    if (account === undefined) {
      throw new Error(`account ${userId} not found: expected the session's account`);
    }
    const [contacts, standing, tables] = await Promise.all([
      this.contactPartsOf(account.id),
      this.standingPartsOf(account.id),
      this.tablePartsOf(account.id),
    ]);
    return { account, ...contacts, ...standing, ...tables };
  }

  private async contactPartsOf(id: string): Promise<Pick<DataExportParts, ContactPart>> {
    const { accounts } = this.deps;
    const [twoFactorEnabledAt, sessions, savedColors, friends, requestsSent, requestsReceived] =
      await Promise.all([
        accounts.twoFactorEnabledAt(id),
        accounts.sessionsOf(id),
        accounts.savedColorsOf(id),
        accounts.friendsOf(id),
        accounts.requestsSentBy(id),
        accounts.requestsReceivedBy(id),
      ]);
    return { twoFactorEnabledAt, sessions, savedColors, friends, requestsSent, requestsReceived };
  }

  /** The votes received leave only as the sum the card shows, never who gave them. */
  private async standingPartsOf(id: string): Promise<Pick<DataExportParts, StandingPart>> {
    const { accounts, moderation, reputation, minVotes } = this.deps;
    const [blocks, votesGiven, counts, badges, reportsMade, sanctions, feedbackSent] =
      await Promise.all([
        accounts.blocksBy(id),
        accounts.votesGivenBy(id),
        reputation.countsFor(id, id),
        accounts.badgesOf(id),
        moderation.reportsMadeBy(id),
        moderation.sanctionsOf(id),
        moderation.feedbackSentBy(id),
      ]);
    const reputationReceived = summarizeReputation(counts, minVotes);
    const moderationParts = { reportsMade, sanctions, feedbackSent };
    return { blocks, votesGiven, reputationReceived, badges, ...moderationParts };
  }

  private async tablePartsOf(userId: string): Promise<Pick<DataExportParts, TablePart>> {
    const { tables } = this.deps;
    const [memberships, characters, sheets, documents, savedRolls, assets] = await Promise.all([
      tables.membershipsOf(userId),
      tables.charactersOf(userId),
      tables.sheetsOf(userId),
      tables.documentsOf(userId),
      tables.savedRollsOf(userId),
      tables.assetsSentBy(userId),
    ]);
    const [bars, tabs] = await Promise.all([
      tables.barsOf(characters.map((character) => character.id)),
      tables.readableTabsOf(
        userId,
        documents.map((document) => document.id),
      ),
    ]);
    return { memberships, characters, bars, sheets, documents, tabs, savedRolls, assets };
  }

  /** `dados.json` first, then each image as it streams from the bucket, and the `LEIA-ME.txt`
   *  last, so it can list the images the bucket no longer had. */
  private async fill(zip: ArchiveEntries, plan: ArchivePlan): Promise<void> {
    await zip.addFile('dados.json', encoder.encode(JSON.stringify(plan.dto, null, 2)));
    const missingImages: string[] = [];
    for (const image of plan.images) {
      if (!(await this.addImage(zip, image))) missingImages.push(image.path);
    }
    const readme = exportReadmeOf({ ...plan, missingImages });
    await zip.addFile('LEIA-ME.txt', encoder.encode(readme));
  }

  private async addImage(zip: ArchiveEntries, image: ArchiveImage): Promise<boolean> {
    const object = await this.openOrNull(image.storageKey);
    if (object === null) return false;
    await zip.addStream(image.path, object.body);
    return true;
  }

  private async openOrNull(storageKey: string): Promise<StoredObject | null> {
    try {
      return await this.deps.storage.open(storageKey);
    } catch (error) {
      this.deps.log.warn({ err: error, storageKey }, 'data export left out an unreadable image');
      return null;
    }
  }
}
