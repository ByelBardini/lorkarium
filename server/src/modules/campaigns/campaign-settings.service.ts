import type { CampaignDetailDto, UpdateCampaignRequestDto } from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import type { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { CachedMemberships } from './cached-memberships';
import type { CampaignChangedPort } from './campaign-changed.port';
import type { CampaignCodePort } from './campaign-code.port';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignSettingsBo } from './campaign-settings.bo';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignCodeExhaustedError, CampaignNotFoundError } from './campaigns.error';
import { toCampaignInfoDto, toCampaignPatch, toCampaignSettingsBo } from './campaigns.mapper';
import { MAX_CODE_ATTEMPTS, type CampaignsService } from './campaigns.service';
import type { PresenceReaderPort } from './presence-reader.port';

export type CampaignSettingsServiceDeps = Readonly<{
  /** `findById`: the owner, who alone (with a juggernaut) deletes the campaign. */
  campaigns: Pick<CampaignsDao, 'findById' | 'update' | 'replaceJoinCode' | 'delete'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
  /** The image of a cover must be an asset of the same table. */
  assets: Pick<AssetsDao, 'findInCampaign'>;
  /** The detail read back after the write: the answer and the event carry the same campaign. */
  detail: Pick<CampaignsService, 'detail'>;
  /** A deleted campaign is forgotten, so no board command passes for it. */
  memberships: Pick<CachedMemberships, 'forgetCampaign'>;
  changed: CampaignChangedPort;
  /** Only a master with the table open in a live connection changes its settings. */
  presence: PresenceReaderPort;
  codes: CampaignCodePort;
  hasher: PasswordHasherPort;
  clock: ClockPort;
}>;

/** The masters' settings of a campaign: edit it and hand out another join code (any master), and
 *  delete it (owner powers only); each write is saved before the live table hears of it.
 *
 *  Example: `await settings.update(userOf(request).id, campaignId, input)` */
export class CampaignSettingsService {
  constructor(private readonly deps: CampaignSettingsServiceDeps) {}

  async update(
    userId: string,
    campaignId: string,
    input: UpdateCampaignRequestDto,
  ): Promise<CampaignDetailDto> {
    const settings = await this.masterSettings(userId, campaignId, 'change the campaign settings');
    if (input.cover?.kind === 'image') {
      await this.checkCoverImage(settings, campaignId, input.cover.assetId);
    }
    const passwordHash = await this.passwordHashOf(settings, input.password);
    const patch = toCampaignPatch(input, { passwordHash, updatedAt: this.deps.clock.now() });
    const row = await this.deps.campaigns.update(campaignId, patch);
    if (!row) throw new CampaignNotFoundError({ campaignId, userId });
    return this.announce(userId, campaignId);
  }

  /** A new code replaces the old one, which stops working; members already in stay. */
  async regenerateJoinCode(userId: string, campaignId: string): Promise<CampaignDetailDto> {
    await this.masterSettings(userId, campaignId, 'generate another join code');
    const attempts: string[] = [];
    while (attempts.length < MAX_CODE_ATTEMPTS) {
      const joinCode = this.deps.codes.generate();
      attempts.push(joinCode);
      if (await this.replaceUnlessTaken(userId, campaignId, joinCode)) {
        return this.announce(userId, campaignId);
      }
    }
    throw new CampaignCodeExhaustedError(attempts);
  }

  async delete(userId: string, campaignId: string): Promise<void> {
    const settings = await this.settingsOf(userId, campaignId);
    settings.requireOwnerPowersAtTable('delete the campaign');
    const deleted = await this.deps.campaigns.delete(campaignId);
    if (!deleted) throw new CampaignNotFoundError({ campaignId, userId });
    this.deps.memberships.forgetCampaign(campaignId);
    await this.deps.changed.campaignDeleted(campaignId);
  }

  private async masterSettings(
    userId: string,
    campaignId: string,
    action: string,
  ): Promise<CampaignSettingsBo> {
    const settings = await this.settingsOf(userId, campaignId);
    settings.requireMasterAtTable(action);
    return settings;
  }

  private async settingsOf(userId: string, campaignId: string): Promise<CampaignSettingsBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const atTable = this.deps.presence.onlineUserIdsOf(campaignId).has(userId);
    const ownerId = (await this.deps.campaigns.findById(campaignId))?.ownerId ?? null;
    return toCampaignSettingsBo(campaignId, userId, membership, atTable, ownerId);
  }

  private async checkCoverImage(
    settings: CampaignSettingsBo,
    campaignId: string,
    assetId: string,
  ): Promise<void> {
    const asset = await this.deps.assets.findInCampaign(campaignId, assetId);
    settings.requireCoverImage({ assetId, purpose: asset?.purpose ?? null });
  }

  private async passwordHashOf(
    settings: CampaignSettingsBo,
    password: string | null | undefined,
  ): Promise<string | null | undefined> {
    const change = settings.passwordChange(password);
    if (change.kind === 'keep') return undefined;
    if (change.kind === 'remove') return null;
    return this.deps.hasher.hash(change.password);
  }

  private async replaceUnlessTaken(
    userId: string,
    campaignId: string,
    joinCode: string,
  ): Promise<boolean> {
    try {
      const replaced = await this.deps.campaigns.replaceJoinCode(
        campaignId,
        joinCode,
        this.deps.clock.now(),
      );
      if (!replaced) throw new CampaignNotFoundError({ campaignId, userId });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private async announce(userId: string, campaignId: string): Promise<CampaignDetailDto> {
    const detail = await this.deps.detail.detail(userId, campaignId);
    this.deps.changed.campaignUpdated(toCampaignInfoDto(detail));
    return detail;
  }
}
