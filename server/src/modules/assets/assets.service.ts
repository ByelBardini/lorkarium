import type { AssetReadPolicyPort } from './asset-read-policy.port';
import {
  ASSET_MAX_BYTES,
  ASSET_MAX_SIDE,
  AURA_ANIMATION_LIMITS,
  SHEET_TEMPLATE_FONT_MAX_BYTES,
  SHEET_TEMPLATE_FONT_MIME_TYPE,
  type AssetDto,
  type AssetOutlineResponseDto,
  type AssetPurposeDto,
  type SheetTemplateAssetDto,
  type SheetTemplateAssetMimeTypeDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { UsersDao } from '../auth/users.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import { PlanLimitsBo, effectiveLimitsOf } from '../plans/plan-limits.bo';
import { looseCutoffOf, planSidesOf } from './asset-quota.bo';
import type { AssetReferencesDao } from './asset-references.dao';
import {
  animationFor,
  dedicatedEndpointOf,
  isMasterOnlyAssetPurpose,
  isProtectedAssetPurpose,
  opaqueAsWebpFor,
  outlineFor,
  requireSize,
  requireWoff2,
  resizeFor,
  type SideLimits,
} from './asset-upload.bo';
import { assetEtagOf, isRevalidated, PROTECTED_ASSET_CACHE_CONTROL } from './asset-revalidation.bo';
import type { AssetStoragePort, StoredObject } from './asset-storage.port';
import type { AssetHeaderPo, AssetsDao } from './assets.dao';
import {
  AssetNotFoundError,
  AssetTooLargeError,
  LinkBlockedError,
  LinkNotImageError,
  LinkUnreachableError,
  UnsupportedImageError,
} from './assets.error';
import {
  storageKeyOf,
  toAssetDto,
  toAssetOutlineDto,
  toNewAssetPo,
  toNewFontAssetPo,
  toSheetTemplateAssetDto,
} from './assets.mapper';
import type { AssetPo } from './assets.po';
import type { FetchRefusal, ImageFetcherPort } from './image-fetcher.port';
import type { ImageProcessorPort, NormalizedImage, NormalizeOptions } from './image-processor.port';

/** The DAOs of the transaction that keeps a file within the storage of the table's owner. */
export type AssetKeepScope = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
  owners: Pick<UsersDao, 'lockForPlan'>;
  references: Pick<AssetReferencesDao, 'usageOfOwner'>;
  assets: Pick<AssetsDao, 'insert'>;
}>;

export type AssetKeepTransactionRunner = <T>(
  work: (scope: AssetKeepScope) => Promise<T>,
) => Promise<T>;

export type AssetsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsDao, 'findById' | 'findHeaderById'>;
  /** The plan of the table's owner, unlocked: it only decides the sides before decoding. */
  tableOwners: Pick<CampaignsDao, 'findOwnerPlan'>;
  /** Where the storage quota is counted and the row written, under the table's and owner's locks. */
  keeping: AssetKeepTransactionRunner;
  clock: ClockPort;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  fetcher: ImageFetcherPort;
  newId: () => string;
  readPolicy?: AssetReadPolicyPort;
}>;

/** An asset read back for a member: the stream with the type of the record. */
export type OpenedAsset = Readonly<{
  body: StoredObject['body'];
  size: number;
  mimeType: AssetPo['mimeType'];
  cacheControl?: string;
  etag?: string;
}>;

/** A protected asset the browser already holds, still readable: 304, no bytes and no S3. */
export type RevalidatedAsset = Readonly<{ notModified: true; cacheControl: string; etag: string }>;

type TableOfUser = Readonly<{ campaignId: string; userId: string }>;

type Incoming = TableOfUser & Readonly<{ purpose: AssetPurposeDto }>;

/** The asset use cases. Every image is decoded and rewritten before it is kept (a map or a
 *  background no larger than the owner's plan allows), the kept bytes must fit the owner's
 *  storage, the object goes to the S3 **before** its row (a row without its object would break
 *  the table; an object without its row is only garbage), and only a member sends or reads.
 *
 *  Example: `await assetsService.upload(user.id, campaignId, { bytes, purpose: 'token' })` */
export class AssetsService {
  constructor(private readonly deps: AssetsServiceDeps) {}

  async upload(
    userId: string,
    campaignId: string,
    file: Readonly<{ bytes: Uint8Array; purpose: AssetPurposeDto }>,
  ): Promise<AssetDto> {
    await this.refuseDedicated(userId, campaignId, `upload ${file.purpose}`, file.purpose);
    return this.uploadFor(userId, campaignId, file);
  }

  /** Who may read a sheet image is decided by the sheet route, which authorizes before and
   *  associates after. */
  async uploadSheetImage(userId: string, campaignId: string, bytes: Uint8Array): Promise<AssetDto> {
    return this.uploadFor(userId, campaignId, { bytes, purpose: 'sheet_image' });
  }

  /** A font or an image of a sheet template, sent by a master; the template route authorizes and
   *  the template's manifest associates it. A font is kept as sent once its signature says WOFF2
   *  and it fits `SHEET_TEMPLATE_FONT_MAX_BYTES`; an image goes through the processor.
   *
   *  Example: `await assets.uploadSheetTemplateAsset(userId, campaignId, { bytes, mimeType: 'font/woff2' })` */
  async uploadSheetTemplateAsset(
    userId: string,
    campaignId: string,
    file: Readonly<{ bytes: Uint8Array; mimeType: SheetTemplateAssetMimeTypeDto }>,
  ): Promise<SheetTemplateAssetDto> {
    const purpose = 'sheet_template_asset';
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(`upload a ${purpose}`);
    if (file.mimeType === SHEET_TEMPLATE_FONT_MIME_TYPE)
      return toSheetTemplateAssetDto(await this.keepFont({ campaignId, userId }, file.bytes));
    requireSize(file.bytes.byteLength, ASSET_MAX_BYTES);
    const kept = keptAs(purpose, ASSET_MAX_SIDE);
    const normalized = await this.deps.processor.normalize(file.bytes, kept);
    if (!normalized.ok) throw new UnsupportedImageError(normalized.refusal.detail);
    const row = await this.keepRow({ campaignId, userId, purpose }, normalized.image);
    return toSheetTemplateAssetDto(row);
  }

  // A font is not decoded (no processor reads fonts): it is checked by its signature and size.
  private async keepFont(
    owner: Readonly<{ campaignId: string; userId: string }>,
    bytes: Uint8Array,
  ): Promise<AssetPo> {
    requireSize(bytes.byteLength, SHEET_TEMPLATE_FONT_MAX_BYTES);
    requireWoff2(bytes);
    const assetId = this.deps.newId();
    const { campaignId, userId } = owner;
    return this.keepWithin(owner, bytes.byteLength, async (rows) => {
      await this.deps.storage.put(storageKeyOf(assetId), bytes, SHEET_TEMPLATE_FONT_MIME_TYPE);
      return rows.insert(toNewFontAssetPo({ assetId, campaignId, ownerId: userId, bytes }));
    });
  }

  async uploadDocumentImage(
    userId: string,
    campaignId: string,
    bytes: Uint8Array,
  ): Promise<AssetDto> {
    return this.uploadFor(userId, campaignId, { bytes, purpose: 'document_image' });
  }

  private async uploadFor(
    userId: string,
    campaignId: string,
    file: Readonly<{ bytes: Uint8Array; purpose: AssetPurposeDto }>,
  ): Promise<AssetDto> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    if (isMasterOnlyAssetPurpose(file.purpose)) access.requireMaster(`upload a ${file.purpose}`);
    requireSize(file.bytes.byteLength, ASSET_MAX_BYTES);
    const kept = keptAs(file.purpose, await this.sidesOf({ campaignId, userId }));
    const normalized = await this.deps.processor.normalize(file.bytes, kept);
    if (!normalized.ok) throw new UnsupportedImageError(normalized.refusal.detail);
    return this.keep({ campaignId, userId, purpose: file.purpose }, normalized.image);
  }

  async importLink(
    userId: string,
    campaignId: string,
    link: Readonly<{ url: string; purpose: AssetPurposeDto }>,
  ): Promise<AssetDto> {
    await this.refuseDedicated(userId, campaignId, `import ${link.purpose}`, link.purpose);
    return this.importFor(userId, campaignId, link);
  }

  async importDocumentImage(userId: string, campaignId: string, url: string): Promise<AssetDto> {
    return this.importFor(userId, campaignId, { url, purpose: 'document_image' });
  }

  // Before any I/O: a reserved image sent here would have no owner to authorize its readers.
  private async refuseDedicated(
    userId: string,
    campaignId: string,
    action: string,
    purpose: AssetPurposeDto,
  ): Promise<void> {
    const endpoint = dedicatedEndpointOf(purpose);
    if (endpoint === null) return;
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.forbid(`${action} through generic assets`, endpoint);
  }

  private async importFor(
    userId: string,
    campaignId: string,
    link: Readonly<{ url: string; purpose: AssetPurposeDto }>,
  ): Promise<AssetDto> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    if (isMasterOnlyAssetPurpose(link.purpose)) access.requireMaster(`import a ${link.purpose}`);
    const fetched = await this.deps.fetcher.fetch(link.url);
    if (!fetched.ok) throw linkErrorOf(link.url, fetched.refusal);
    requireSize(fetched.image.bytes.byteLength, ASSET_MAX_BYTES);
    const kept = keptAs(link.purpose, await this.sidesOf({ campaignId, userId }));
    const image = await this.normalizeLinked(link.url, fetched.image.bytes, kept);
    return this.keep({ campaignId, userId, purpose: link.purpose }, image);
  }

  /** The bytes of an asset for a member of its campaign; anyone else, a missing row or a missing
   *  object all get the same `ASSET_NOT_FOUND` (criterion 14). A protected asset whose ETag
   *  `ifNoneMatch` names comes back revalidated: after the policy, before the S3.
   *
   *  Example: `await assetsService.open(bia.id, mapId, request.headers['if-none-match'])` */
  async open(
    userId: string,
    assetId: string,
    ifNoneMatch?: string,
  ): Promise<OpenedAsset | RevalidatedAsset> {
    const row = await this.readable(
      userId,
      assetId,
      await this.deps.assets.findHeaderById(assetId),
    );
    const revalidation = revalidationOf(row);
    if (revalidation && isRevalidated(ifNoneMatch, revalidation.etag))
      return { notModified: true, ...revalidation };
    const object = await this.deps.storage.open(row.storageKey);
    if (object === null) throw new AssetNotFoundError(assetId);
    return { body: object.body, size: object.size, mimeType: row.mimeType, ...revalidation };
  }

  /** The silhouette of an asset, under the same guard as its bytes; it reads no object, so an old
   *  row or a vanished file still answers.
   *
   *  Example: `(await assetsService.outlineOf(user.id, imageId)).outline // polygons, [] or null` */
  async outlineOf(userId: string, assetId: string): Promise<AssetOutlineResponseDto> {
    return toAssetOutlineDto(
      await this.readable(userId, assetId, await this.deps.assets.findById(assetId)),
    );
  }

  private async readable<R extends AssetHeaderPo>(
    userId: string,
    assetId: string,
    row: R | undefined,
  ): Promise<R> {
    if (row === undefined) throw new AssetNotFoundError(assetId);
    const membership = await this.deps.members.findMembership(row.campaignId, userId);
    if (membership === undefined) throw new AssetNotFoundError(assetId);
    if (
      isProtectedAssetPurpose(row.purpose) &&
      !(await this.deps.readPolicy?.canRead(userId, row.campaignId, row.id, row.purpose))
    )
      throw new AssetNotFoundError(assetId);
    return row;
  }

  // A link that answers with a web page (an image search result) is a wrong link, not a bad file.
  private async normalizeLinked(
    url: string,
    bytes: Uint8Array,
    kept: NormalizeOptions,
  ): Promise<NormalizedImage> {
    const normalized = await this.deps.processor.normalize(bytes, kept);
    if (!normalized.ok) throw new LinkNotImageError(url);
    return normalized.image;
  }

  private async keep(incoming: Incoming, image: NormalizedImage): Promise<AssetDto> {
    return toAssetDto(await this.keepRow(incoming, image));
  }

  private async keepRow(incoming: Incoming, image: NormalizedImage): Promise<AssetPo> {
    const assetId = this.deps.newId();
    return this.keepWithin(incoming, image.bytes.byteLength, async (rows) => {
      await this.deps.storage.put(storageKeyOf(assetId), image.bytes, image.mimeType);
      return rows.insert(toNewAssetPo({ ...incoming, ownerId: incoming.userId, assetId, image }));
    });
  }

  // The sides follow the owner's plan; read unlocked, as only the quota decides a write.
  private async sidesOf(table: TableOfUser): Promise<SideLimits> {
    const owner = await this.deps.tableOwners.findOwnerPlan(table.campaignId);
    if (!owner) throw new CampaignNotFoundError(table);
    return planSidesOf(ASSET_MAX_SIDE, effectiveLimitsOf(owner));
  }

  // After normalizing (the kept bytes count) and before the object goes out. The owner's lock
  // serializes every upload of their tables, so two never fit the same remaining space.
  private async keepWithin(
    table: TableOfUser,
    bytes: number,
    store: (rows: AssetKeepScope['assets']) => Promise<AssetPo>,
  ): Promise<AssetPo> {
    return this.deps.keeping(async (scope) => {
      const locked = await scope.campaigns.lockWithOwner(table.campaignId);
      if (!locked) throw new CampaignNotFoundError(table);
      const owner = (await scope.owners.lockForPlan(locked.ownerId)) ?? locked.owner;
      const cutoff = looseCutoffOf(this.deps.clock.now());
      const used = await scope.references.usageOfOwner(locked.ownerId, cutoff);
      PlanLimitsBo.requireRoom('storage', used, bytes, effectiveLimitsOf(owner));
      return store(scope.assets);
    });
  }
}

// The budget key is left out when the purpose never animates, so the processor refuses a GIF.
function keptAs(purpose: AssetPurposeDto, sides: SideLimits): NormalizeOptions {
  const resize = resizeFor(purpose, sides);
  const animation = animationFor(purpose, AURA_ANIMATION_LIMITS);
  return {
    ...resize,
    ...(animation ? { animation } : {}),
    ...(outlineFor(purpose) ? { outline: true } : {}),
    ...(opaqueAsWebpFor(purpose) ? { opaqueAsWebp: true } : {}),
  };
}

function linkErrorOf(url: string, refusal: FetchRefusal): Error {
  if (refusal.kind === 'blocked') return new LinkBlockedError(refusal.host, refusal.address);
  if (refusal.kind === 'too-large') return new AssetTooLargeError(refusal.limit, refusal.received);
  return new LinkUnreachableError(url, refusal.reason);
}

// Only a protected purpose is revalidated: its permission can change, the others are immutable.
function revalidationOf(row: AssetHeaderPo): { cacheControl: string; etag: string } | undefined {
  if (!isProtectedAssetPurpose(row.purpose)) return undefined;
  return { cacheControl: PROTECTED_ASSET_CACHE_CONTROL, etag: assetEtagOf(row.id) };
}
