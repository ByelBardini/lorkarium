import { Readable } from 'node:stream';
import type { AddressPolicy } from '../../src/infrastructure/image-fetcher/address-policy';
import type { AssetStoragePort, StoredObject } from '../../src/modules/assets/asset-storage.port';
import type { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPo, NewAssetPo } from '../../src/modules/assets/assets.po';
import type {
  FetchedImage,
  FetchOutcome,
  FetchRefusal,
  ImageFetcherPort,
} from '../../src/modules/assets/image-fetcher.port';
import type {
  ImageProcessorPort,
  ImageRefusal,
  NormalizedImage,
  NormalizeOutcome,
} from '../../src/modules/assets/image-processor.port';

const FAKE_DATE = new Date('2026-10-17T12:00:00Z');

/** Lets the fetcher reach only the IPv4 loopback, where the spec's HTTP server listens. */
export class LoopbackOnlyPolicyFake implements AddressPolicy {
  allows(address: string): boolean {
    return address === '127.0.0.1';
  }
}

/** An in-memory bucket; writes 'put' and 'remove:<key>' to the shared journal. */
export class AssetStorageFake implements AssetStoragePort {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  constructor(private readonly journal: string[] = []) {}

  async ensureBucket(): Promise<void> {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.journal.push('put');
    this.objects.set(key, { bytes, contentType });
  }

  async open(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    const body = Readable.from([Buffer.from(object.bytes)]);
    return { body, size: object.bytes.byteLength, contentType: object.contentType };
  }

  async remove(key: string): Promise<void> {
    this.journal.push(`remove:${key}`);
    this.objects.delete(key);
  }
}

/** Answers every image with `result` (or throws `refusal`); records the `maxSide` it was asked
 *  for and writes 'normalize' to the shared journal. */
export class ImageProcessorFake implements ImageProcessorPort {
  readonly maxSides: number[] = [];
  refusal: ImageRefusal | null = null;
  result: NormalizedImage = {
    bytes: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    mimeType: 'image/png',
    width: 1024,
    height: 512,
  };

  constructor(private readonly journal: string[] = []) {}

  async normalize(
    _bytes: Uint8Array,
    options: Readonly<{ maxSide: number }>,
  ): Promise<NormalizeOutcome> {
    this.journal.push('normalize');
    this.maxSides.push(options.maxSide);
    if (this.refusal !== null) return { ok: false, refusal: this.refusal };
    return { ok: true, image: this.result };
  }
}

/** Answers every link with `answer` (or throws `refusal`); records the links asked. */
export class ImageFetcherFake implements ImageFetcherPort {
  readonly fetched: string[] = [];
  refusal: FetchRefusal | null = null;
  answer: FetchedImage = { bytes: Uint8Array.from([9, 9, 9]), contentType: 'image/png' };

  async fetch(url: string): Promise<FetchOutcome> {
    this.fetched.push(url);
    if (this.refusal !== null) return { ok: false, refusal: this.refusal };
    return { ok: true, image: this.answer };
  }
}

/** Asset rows in memory; writes 'insert' to the shared journal. */
export class AssetsDaoFake implements Pick<
  AssetsDao,
  'insert' | 'findById' | 'findInCampaign' | 'findManyInCampaign'
> {
  constructor(
    private readonly journal: string[] = [],
    readonly rows: AssetPo[] = [],
  ) {}

  async insert(row: NewAssetPo): Promise<AssetPo> {
    this.journal.push('insert');
    const inserted: AssetPo = {
      id: row.id ?? `asset-${this.rows.length + 1}`,
      ownerId: null,
      createdAt: FAKE_DATE,
      ...row,
    };
    this.rows.push(inserted);
    return inserted;
  }

  async findById(assetId: string): Promise<AssetPo | undefined> {
    return this.rows.find((row) => row.id === assetId);
  }

  async findInCampaign(campaignId: string, assetId: string): Promise<AssetPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === assetId);
  }

  async findManyInCampaign(campaignId: string, assetIds: readonly string[]): Promise<AssetPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId && assetIds.includes(row.id));
  }
}
