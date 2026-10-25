import {
  ASSET_MAX_BYTES,
  ASSET_MAX_SIDE,
  AURA_ANIMATION_LIMITS,
  type AssetDto,
  type AssetMimeTypeDto,
  type AssetPurposeDto,
} from '@lorkarium/contracts';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import { animationFor, requireSize, resizeFor } from './asset-upload.bo';
import type { AssetStoragePort, StoredObject } from './asset-storage.port';
import type { AssetsDao } from './assets.dao';
import {
  AssetNotFoundError,
  AssetTooLargeError,
  LinkBlockedError,
  LinkNotImageError,
  LinkUnreachableError,
  UnsupportedImageError,
} from './assets.error';
import { storageKeyOf, toAssetDto, toNewAssetPo } from './assets.mapper';
import type { FetchRefusal, ImageFetcherPort } from './image-fetcher.port';
import type { ImageProcessorPort, NormalizedImage, NormalizeOptions } from './image-processor.port';

export type AssetsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsDao, 'insert' | 'findById'>;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  fetcher: ImageFetcherPort;
  newId: () => string;
}>;

/** An asset read back for a member: the stream with the type of the record. */
export type OpenedAsset = Readonly<{
  body: StoredObject['body'];
  size: number;
  mimeType: AssetMimeTypeDto;
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
    await memberAccessOf(this.deps.members, campaignId, userId);
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
    await memberAccessOf(this.deps.members, campaignId, userId);
    const fetched = await this.deps.fetcher.fetch(link.url);
    if (!fetched.ok) throw linkErrorOf(link.url, fetched.refusal);
    requireSize(fetched.image.bytes.byteLength, ASSET_MAX_BYTES);
    const image = await this.normalizeLinked(link.url, fetched.image.bytes, link.purpose);
    return this.keep({ campaignId, userId, purpose: link.purpose }, image);
  }

  /** The bytes of an asset for a member of its campaign; anyone else, a missing row or a missing
   *  object all get the same `ASSET_NOT_FOUND` (criterion 14). */
  async open(userId: string, assetId: string): Promise<OpenedAsset> {
    const row = await this.deps.assets.findById(assetId);
    if (row === undefined) throw new AssetNotFoundError(assetId);
    const membership = await this.deps.members.findMembership(row.campaignId, userId);
    if (membership === undefined) throw new AssetNotFoundError(assetId);
    const object = await this.deps.storage.open(row.storageKey);
    if (object === null) throw new AssetNotFoundError(assetId);
    return { body: object.body, size: object.size, mimeType: row.mimeType };
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
    const assetId = this.deps.newId();
    await this.deps.storage.put(storageKeyOf(assetId), image.bytes, image.mimeType);
    const row = await this.deps.assets.insert(
      toNewAssetPo({ ...incoming, ownerId: incoming.userId, assetId, image }),
    );
    return toAssetDto(row);
  }
}

// The budget key is left out when the purpose never animates, so the processor refuses a GIF.
function keptAs(purpose: AssetPurposeDto): NormalizeOptions {
  const resize = resizeFor(purpose, ASSET_MAX_SIDE);
  const animation = animationFor(purpose, AURA_ANIMATION_LIMITS);
  return animation ? { ...resize, animation } : resize;
}

function linkErrorOf(url: string, refusal: FetchRefusal): Error {
  if (refusal.kind === 'blocked') return new LinkBlockedError(refusal.host, refusal.address);
  if (refusal.kind === 'too-large') return new AssetTooLargeError(refusal.limit, refusal.received);
  return new LinkUnreachableError(url, refusal.reason);
}
