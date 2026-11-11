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
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import {
  animationFor,
  dedicatedEndpointOf,
  isMasterOnlyAssetPurpose,
  isProtectedAssetPurpose,
  outlineFor,
  requireSize,
  requireWoff2,
  resizeFor,
} from './asset-upload.bo';
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

export type AssetsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsDao, 'insert' | 'findById' | 'findHeaderById'>;
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
}>;

type Incoming = Readonly<{ campaignId: string; userId: string; purpose: AssetPurposeDto }>;

/** The asset use cases. Every image is decoded and rewritten before it is kept, the object goes
 *  to the S3 **before** its row (a row without its object would break the table; an object
 *  without its row is only garbage), and only a member of the campaign sends or reads.
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
    const normalized = await this.deps.processor.normalize(file.bytes, keptAs(purpose));
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
    await this.deps.storage.put(storageKeyOf(assetId), bytes, SHEET_TEMPLATE_FONT_MIME_TYPE);
    const { campaignId, userId } = owner;
    return this.deps.assets.insert(
      toNewFontAssetPo({ assetId, campaignId, ownerId: userId, bytes }),
    );
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
    const normalized = await this.deps.processor.normalize(file.bytes, keptAs(file.purpose));
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
    const image = await this.normalizeLinked(link.url, fetched.image.bytes, link.purpose);
    return this.keep({ campaignId, userId, purpose: link.purpose }, image);
  }

  /** The bytes of an asset for a member of its campaign; anyone else, a missing row or a missing
   *  object all get the same `ASSET_NOT_FOUND` (criterion 14). */
  async open(userId: string, assetId: string): Promise<OpenedAsset> {
    const row = await this.readable(
      userId,
      assetId,
      await this.deps.assets.findHeaderById(assetId),
    );
    const object = await this.deps.storage.open(row.storageKey);
    if (object === null) throw new AssetNotFoundError(assetId);
    return {
      body: object.body,
      size: object.size,
      mimeType: row.mimeType,
      ...(isProtectedAssetPurpose(row.purpose) ? { cacheControl: 'private, no-store' } : {}),
    };
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
    purpose: AssetPurposeDto,
  ): Promise<NormalizedImage> {
    const normalized = await this.deps.processor.normalize(bytes, keptAs(purpose));
    if (!normalized.ok) throw new LinkNotImageError(url);
    return normalized.image;
  }

  private async keep(incoming: Incoming, image: NormalizedImage): Promise<AssetDto> {
    return toAssetDto(await this.keepRow(incoming, image));
  }

  private async keepRow(incoming: Incoming, image: NormalizedImage): Promise<AssetPo> {
    const assetId = this.deps.newId();
    await this.deps.storage.put(storageKeyOf(assetId), image.bytes, image.mimeType);
    return this.deps.assets.insert(
      toNewAssetPo({ ...incoming, ownerId: incoming.userId, assetId, image }),
    );
  }
}

// The budget key is left out when the purpose never animates, so the processor refuses a GIF.
function keptAs(purpose: AssetPurposeDto): NormalizeOptions {
  const resize = resizeFor(purpose, ASSET_MAX_SIDE);
  const animation = animationFor(purpose, AURA_ANIMATION_LIMITS);
  return {
    ...resize,
    ...(animation ? { animation } : {}),
    ...(outlineFor(purpose) ? { outline: true } : {}),
  };
}

function linkErrorOf(url: string, refusal: FetchRefusal): Error {
  if (refusal.kind === 'blocked') return new LinkBlockedError(refusal.host, refusal.address);
  if (refusal.kind === 'too-large') return new AssetTooLargeError(refusal.limit, refusal.received);
  return new LinkUnreachableError(url, refusal.reason);
}
