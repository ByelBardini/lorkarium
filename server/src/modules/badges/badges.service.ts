import {
  BADGE_IMAGE_MAX_BYTES,
  type AdminBadgeDto,
  type BadgeDto,
  type CreateBadgeRequestDto,
  type UpdateBadgeRequestDto,
} from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { ImageCrop } from '../assets/image-processor.port';
import type { UsersDao } from '../auth/users.dao';
import type { AvatarProcessorPort } from '../profiles/avatar-processor.port';
import { grantVerdict, orderVerdict, type GrantVerdict } from './badges.bo';
import type { BadgeCatalogRow, BadgesDao } from './badges.dao';
import {
  BadgeAccountNotFoundError,
  BadgeImageNotFoundError,
  BadgeImageTooLargeError,
  BadgeNameTakenError,
  BadgeNotFoundError,
  BadgeOrderStaleError,
  BadgeWithoutImageError,
  UnsupportedBadgeImageError,
  type BadgesError,
} from './badges.error';
import {
  BADGE_IMAGE_CONTENT_TYPE,
  BADGE_IMAGE_SHAPE,
  badgeImageKeyOf,
  shownBadgesOf,
  toAdminBadgeDto,
  toBadgeChanges,
  toCatalogEntries,
} from './badges.mapper';

const NAME_INDEX = 'badges_name_unique';

/** The DAOs a transaction of the module writes with, built over the `tx`. */
export type BadgesWriteDaos = Readonly<{
  badges: Pick<
    BadgesDao,
    'lockCatalog' | 'reorder' | 'listCatalog' | 'replaceGrants' | 'badgesOfAccount'
  >;
  accounts: Pick<UsersDao, 'findById'>;
}>;

export type BadgesTransactionRunner = <T>(
  work: (daos: BadgesWriteDaos) => Promise<T>,
) => Promise<T>;

export type BadgesServiceDeps = Readonly<{
  badges: Pick<
    BadgesDao,
    | 'listCatalog'
    | 'findById'
    | 'insert'
    | 'update'
    | 'swapImage'
    | 'isCurrentImage'
    | 'delete'
    | 'grantIdsOf'
    | 'badgesOfAccount'
  >;
  accounts: Pick<UsersDao, 'findById'>;
  transaction: BadgesTransactionRunner;
  storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>;
  processor: AvatarProcessorPort;
  newId: () => string;
}>;

/** The badge catalog the backoffice keeps (texts, image, order), the grants to accounts and the
 *  badges an account shows. Every write is saved before an old image leaves the bucket.
 *
 *  Example: `await new BadgesService(deps).grant(biaId, [veteranoId])` */
export class BadgesService {
  constructor(private readonly deps: BadgesServiceDeps) {}

  /** Example: `(await badges.catalog()).map((badge) => badge.name)` */
  async catalog(): Promise<AdminBadgeDto[]> {
    return (await this.deps.badges.listCatalog()).map(toAdminBadgeDto);
  }

  /** Example: `(await badges.create({ name: 'Veterano', description: '…' })).imageId // null` */
  async create(dto: CreateBadgeRequestDto): Promise<AdminBadgeDto> {
    const row = await this.namedWrite(dto.name, () => this.deps.badges.insert(dto));
    return toAdminBadgeDto({ ...row, holders: 0 });
  }

  /** Example: `await badges.update(badgeId, { description: 'Jogou 200 sessões' })` */
  async update(badgeId: string, dto: UpdateBadgeRequestDto): Promise<AdminBadgeDto> {
    const changes = toBadgeChanges(dto);
    const row = await this.namedWrite(dto.name, () => this.deps.badges.update(badgeId, changes));
    if (!row) throw new BadgeNotFoundError(badgeId);
    return this.adminBadgeOf(badgeId);
  }

  /** Normalizes to a still 128 square inside `crop`, stores it under a new id, points the badge
   *  at it and only then removes the old object: a failure halfway leaves the old image working.
   *
   *  Example: `await badges.uploadImage(badgeId, bytes, { x: 0, y: 0, w: 100, h: 100 })` */
  async uploadImage(
    badgeId: string,
    bytes: Uint8Array,
    crop: ImageCrop | null,
  ): Promise<AdminBadgeDto> {
    if (bytes.byteLength > BADGE_IMAGE_MAX_BYTES) {
      throw new BadgeImageTooLargeError(BADGE_IMAGE_MAX_BYTES, bytes.byteLength);
    }
    await this.adminBadgeOf(badgeId);
    const imageId = await this.storeImage(bytes, crop);
    const swapped = await this.deps.badges.swapImage(badgeId, imageId);
    if (!swapped) return this.dropOrphan(imageId, new BadgeNotFoundError(badgeId));
    if (swapped.previousId !== null) await this.removeImage(swapped.previousId);
    return this.adminBadgeOf(badgeId);
  }

  /** Example: `await badges.reorder([mestreId, veteranoId])` */
  async reorder(badgeIds: readonly string[]): Promise<AdminBadgeDto[]> {
    return this.deps.transaction(async ({ badges }) => {
      const catalogIds = (await badges.lockCatalog()).map((badge) => badge.id);
      const verdict = orderVerdict(catalogIds, badgeIds);
      if (verdict.kind === 'stale') throw new BadgeOrderStaleError(verdict.missing, verdict.extra);
      await badges.reorder(badgeIds);
      return (await badges.listCatalog()).map(toAdminBadgeDto);
    });
  }

  /** The grants go by cascade; the image leaves the bucket after the row.
   *
   *  Example: `await badges.delete(badgeId)` */
  async delete(badgeId: string): Promise<void> {
    const deleted = await this.deps.badges.delete(badgeId);
    if (!deleted) throw new BadgeNotFoundError(badgeId);
    if (deleted.imageId !== null) await this.removeImage(deleted.imageId);
  }

  /** Example: `await badges.grantsOf(biaId) // [veteranoId]` */
  async grantsOf(userId: string): Promise<string[]> {
    await this.requireAccount(this.deps.accounts, userId);
    return this.deps.badges.grantIdsOf(userId);
  }

  /** Leaves the account with exactly `badgeIds` (each one with an image) and answers what it
   *  shows now, in catalog order.
   *
   *  Example: `await badges.grant(biaId, []) // takes every badge off` */
  async grant(userId: string, badgeIds: readonly string[]): Promise<BadgeDto[]> {
    return this.deps.transaction(async ({ badges, accounts }) => {
      await this.requireAccount(accounts, userId);
      const catalog = toCatalogEntries(await badges.lockCatalog());
      throwUnlessGrantable(grantVerdict(catalog, badgeIds));
      await badges.replaceGrants(userId, badgeIds);
      return shownBadgesOf(await badges.badgesOfAccount(userId));
    });
  }

  /** What the account shows on its card and its own profile (the `AccountBadgesPort`).
   *
   *  Example: `await badges.badgesOf(biaId)` */
  async badgesOf(userId: string): Promise<BadgeDto[]> {
    return shownBadgesOf(await this.deps.badges.badgesOfAccount(userId));
  }

  /** A replaced image is 404 even while its object still exists.
   *
   *  Example: `const stored = await badges.openImage(imageId)` */
  async openImage(imageId: string): Promise<StoredObject> {
    if (!(await this.deps.badges.isCurrentImage(imageId))) {
      throw new BadgeImageNotFoundError(imageId);
    }
    const stored = await this.deps.storage.open(badgeImageKeyOf(imageId));
    if (!stored) throw new BadgeImageNotFoundError(imageId);
    return stored;
  }

  private async storeImage(bytes: Uint8Array, crop: ImageCrop | null): Promise<string> {
    const outcome = await this.deps.processor.normalize(bytes, { ...BADGE_IMAGE_SHAPE, crop });
    if (!outcome.ok) throw new UnsupportedBadgeImageError(outcome.refusal.detail);
    const imageId = this.deps.newId();
    const key = badgeImageKeyOf(imageId);
    await this.deps.storage.put(key, outcome.avatar.bytes, BADGE_IMAGE_CONTENT_TYPE);
    return imageId;
  }

  // The badge was deleted between the check and the swap: the new object has no owner.
  private async dropOrphan(imageId: string, error: BadgesError): Promise<never> {
    await this.removeImage(imageId);
    throw error;
  }

  private async removeImage(imageId: string): Promise<void> {
    await this.deps.storage.remove(badgeImageKeyOf(imageId));
  }

  private async adminBadgeOf(badgeId: string): Promise<AdminBadgeDto> {
    const row: BadgeCatalogRow | undefined = await this.deps.badges.findById(badgeId);
    if (!row) throw new BadgeNotFoundError(badgeId);
    return toAdminBadgeDto(row);
  }

  private async requireAccount(
    accounts: Pick<UsersDao, 'findById'>,
    userId: string,
  ): Promise<void> {
    if (!(await accounts.findById(userId))) throw new BadgeAccountNotFoundError(userId);
  }

  private async namedWrite<T>(name: string | undefined, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (name !== undefined && isUniqueViolation(error, NAME_INDEX)) {
        throw new BadgeNameTakenError(name);
      }
      throw error;
    }
  }
}

function throwUnlessGrantable(verdict: GrantVerdict): void {
  if (verdict.kind === 'unknown') throw new BadgeNotFoundError(verdict.badgeId);
  if (verdict.kind === 'without-image') throw new BadgeWithoutImageError(verdict.badgeId);
}
