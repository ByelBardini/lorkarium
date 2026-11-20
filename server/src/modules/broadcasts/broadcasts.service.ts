import type {
  MailBroadcastAudienceDto,
  MailBroadcastContentDto,
  MailBroadcastDraftResponseDto,
  MailBroadcastPreviewDto,
  MailBroadcastResponseDto,
  MailBroadcastsResponseDto,
  MailBroadcastTestResponseDto,
} from '@lorkarium/contracts';
import type { MailMessage, MailerPort } from '../account-security/mailer.port';
import { recipientOf, type MailRecipient } from '../account-security/security-mail.mapper';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { TwoFactorCheckService } from '../auth/two-factor-check.service';
import type { UsersDao } from '../auth/users.dao';
import type { BroadcastAudienceDao } from './broadcast-audience.dao';
import { broadcastMail, type BroadcastLetter } from './broadcast-mail.mapper';
import { BroadcastsError } from './broadcasts.error';
import { letterOf, letterPoOf, toMailBroadcastBo, toMailBroadcastDto } from './broadcasts.mapper';
import { MailBroadcastBo } from './mail-broadcast.bo';
import type { MailBroadcastRow, MailBroadcastsDao } from './mail-broadcasts.dao';

export type BroadcastDrafts = Pick<
  MailBroadcastsDao,
  'insert' | 'list' | 'find' | 'rewrite' | 'markTested'
>;

/** The DAOs of the confirmation, over one transaction. */
export type BroadcastConfirmation = Readonly<{
  broadcasts: Pick<MailBroadcastsDao, 'lock' | 'confirm' | 'find'>;
  audience: Pick<BroadcastAudienceDao, 'freeze'>;
}>;

export type BroadcastConfirmationRunner = <T>(
  work: (daos: BroadcastConfirmation) => Promise<T>,
) => Promise<T>;

export type BroadcastsServiceDeps = Readonly<{
  broadcasts: BroadcastDrafts;
  audience: Pick<BroadcastAudienceDao, 'count'>;
  confirmation: BroadcastConfirmationRunner;
  accounts: Pick<UsersDao, 'findById'>;
  twoFactor: Pick<TwoFactorCheckService, 'isEnabled'>;
  cipher: DataCipherPort;
  mailer: MailerPort;
  clock: ClockPort;
  appPublicUrl: string;
  replyTo: string | null;
}>;

/** The backoffice notices: draft, preview, a test to the admin's own inbox and the confirmation
 *  that freezes the audience. The admin always comes from the session.
 *
 *  Example: `await service.confirm(adminId, broadcastId, 1240)` */
export class BroadcastsService {
  constructor(private readonly deps: BroadcastsServiceDeps) {}

  async list(): Promise<MailBroadcastsResponseDto> {
    const rows = await this.deps.broadcasts.list();
    return { broadcasts: rows.map(toMailBroadcastDto) };
  }

  /** How many accounts `segment` reaches now, for the editor's "vai para N contas". */
  async audienceOf(segment: MailBroadcastContentDto['segment']): Promise<MailBroadcastAudienceDto> {
    return { audience: await this.deps.audience.count(segment) };
  }

  /** The mail as the server renders it, greeting the admin, and the segment's audience now. */
  async preview(
    adminId: string,
    content: MailBroadcastContentDto,
  ): Promise<MailBroadcastPreviewDto> {
    const message = this.mailTo(await this.adminRecipient(adminId), letterOf(letterPoOf(content)));
    const audience = await this.deps.audience.count(content.segment);
    return { subject: message.subject, html: message.html, audience };
  }

  async create(
    adminId: string,
    content: MailBroadcastContentDto,
  ): Promise<MailBroadcastDraftResponseDto> {
    const row = await this.deps.broadcasts.insert({ ...letterPoOf(content), createdBy: adminId });
    return this.draftResponse(row);
  }

  /** Replaces the text of a draft; the test sent before no longer counts. */
  async rewrite(
    broadcastId: string,
    content: MailBroadcastContentDto,
  ): Promise<MailBroadcastDraftResponseDto> {
    toMailBroadcastBo(await this.found(broadcastId)).requireDraft();
    await this.deps.broadcasts.rewrite(broadcastId, letterPoOf(content));
    return this.draftResponse(await this.found(broadcastId));
  }

  /** Sends the draft only to the admin who asks, through the real mailer: a failure is shown. */
  async test(adminId: string, broadcastId: string): Promise<MailBroadcastTestResponseDto> {
    const draft = await this.found(broadcastId);
    toMailBroadcastBo(draft).requireDraft();
    const admin = await this.adminRecipient(adminId);
    await this.sendTest(this.mailTo(admin, letterOf(draft)), broadcastId);
    await this.deps.broadcasts.markTested(broadcastId, this.deps.clock.now());
    return { broadcast: toMailBroadcastDto(await this.found(broadcastId)), to: admin.to };
  }

  /** Freezes the audience (one delivery per account) only if the typed total matches it. */
  async confirm(
    adminId: string,
    broadcastId: string,
    typedTotal: number,
  ): Promise<MailBroadcastResponseDto> {
    const twoFactorOn = await this.deps.twoFactor.isEnabled(adminId);
    const row = await this.deps.confirmation(async ({ broadcasts, audience }) => {
      const locked = await broadcasts.lock(broadcastId);
      if (!locked) throw notFound(broadcastId);
      toMailBroadcastBo(locked).requireConfirmable(twoFactorOn);
      const frozen = await audience.freeze(broadcastId, locked.segment);
      MailBroadcastBo.requireTypedTotal(typedTotal, frozen);
      await broadcasts.confirm(broadcastId, frozen, this.deps.clock.now());
      return broadcasts.find(broadcastId);
    });
    if (!row) throw notFound(broadcastId);
    return { broadcast: toMailBroadcastDto(row) };
  }

  private async draftResponse(row: MailBroadcastRow): Promise<MailBroadcastDraftResponseDto> {
    const audience = await this.deps.audience.count(row.segment);
    return { broadcast: toMailBroadcastDto(row), audience };
  }

  private async found(broadcastId: string): Promise<MailBroadcastRow> {
    const row = await this.deps.broadcasts.find(broadcastId);
    if (row) return row;
    throw notFound(broadcastId);
  }

  private async adminRecipient(adminId: string): Promise<MailRecipient> {
    const row = await this.deps.accounts.findById(adminId);
    if (!row) throw new Error(`admin ${adminId} of the session has no account row`);
    return recipientOf(row, this.deps.cipher);
  }

  private mailTo(person: MailRecipient, letter: BroadcastLetter): MailMessage {
    const { appPublicUrl: publicUrl, replyTo } = this.deps;
    return broadcastMail({ person, letter, publicUrl, replyTo });
  }

  private async sendTest(message: MailMessage, id: string): Promise<void> {
    try {
      await this.deps.mailer.send(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new BroadcastsError(
        'MAIL_DELIVERY_FAILED',
        `test of broadcast ${id} was not delivered (${reason}): expected the SMTP to accept it`,
      );
    }
  }
}

function notFound(broadcastId: string): BroadcastsError {
  return new BroadcastsError(
    'BROADCAST_NOT_FOUND',
    `broadcast ${broadcastId} not found: expected an existing notice`,
  );
}
