import { buffer } from 'node:stream/consumers';
import { ASSET_MAX_SIDE } from '@lorkarium/contracts';
import type { AssetStoragePort } from './asset-storage.port';
import { opaqueAsWebpFor, resizeFor } from './asset-upload.bo';
import type { AssetsDao } from './assets.dao';
import type { AssetPo } from './assets.po';
import type { ImageProcessorPort, NormalizedImage } from './image-processor.port';
import { RecompressImagesRefusedError } from './recompress-images.error';

export type RecompressImagesDeps = Readonly<{
  assets: Pick<AssetsDao, 'listPngImages' | 'updateKeptImage'>;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
}>;

/** `confirmed` is the `--yes` flag: production writes only with it. */
export type RecompressRun = Readonly<{ dryRun: boolean; nodeEnv: string; confirmed: boolean }>;

export type RecompressFailure = Readonly<{ assetId: string; reason: string }>;

/** `bytesBefore`/`bytesAfter` add up only the converted files (in a dry run, the would-be ones). */
export type RecompressReport = Readonly<{
  examined: number;
  converted: number;
  skipped: number;
  failed: readonly RecompressFailure[];
  bytesBefore: number;
  bytesAfter: number;
}>;

type RecompressOutcome =
  | Readonly<{ kind: 'converted'; before: number; after: number }>
  | Readonly<{ kind: 'skipped' }>
  | Readonly<{ kind: 'failed'; reason: string }>;

const SKIPPED: RecompressOutcome = { kind: 'skipped' };

/** Re-encodes the opaque PNG backgrounds, maps and library images kept before WebP became their
 *  format, under the same key (the id never changes, so a cached PNG is still the same picture).
 *  The object goes first and the row follows: a failed put leaves the row as it was.
 *
 *  Example: `await new RecompressImagesService(deps).run({ dryRun: true, nodeEnv, confirmed: false })` */
export class RecompressImagesService {
  constructor(private readonly deps: RecompressImagesDeps) {}

  async run(options: RecompressRun): Promise<RecompressReport> {
    requireAllowed(options);
    const rows = await this.deps.assets.listPngImages();
    let report = emptyReport(rows.length);
    for (const row of rows) {
      report = withOutcome(report, row.id, await this.recompress(row, options.dryRun));
    }
    return report;
  }

  private async recompress(row: AssetPo, dryRun: boolean): Promise<RecompressOutcome> {
    if (!opaqueAsWebpFor(row.purpose)) return SKIPPED;
    try {
      const kept = await this.reencoded(row);
      if (typeof kept === 'string') return { kind: 'failed', reason: kept };
      if (kept.mimeType !== 'image/webp' || kept.bytes.byteLength >= row.sizeBytes) return SKIPPED;
      if (!dryRun) await this.keep(row, kept);
      return { kind: 'converted', before: row.sizeBytes, after: kept.bytes.byteLength };
    } catch (error) {
      return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  // A string is why the file could not be re-encoded.
  private async reencoded(row: AssetPo): Promise<NormalizedImage | string> {
    const stored = await this.deps.storage.open(row.storageKey);
    if (!stored) return `no object under ${row.storageKey}`;
    const bytes = new Uint8Array(await buffer(stored.body));
    const resize = resizeFor(row.purpose, ASSET_MAX_SIDE);
    const outcome = await this.deps.processor.normalize(bytes, { ...resize, opaqueAsWebp: true });
    return outcome.ok ? outcome.image : outcome.refusal.detail;
  }

  private async keep(row: AssetPo, kept: NormalizedImage): Promise<void> {
    await this.deps.storage.put(row.storageKey, kept.bytes, kept.mimeType);
    const { mimeType, width, height } = kept;
    await this.deps.assets.updateKeptImage(row.id, {
      ...{ mimeType, width, height },
      sizeBytes: kept.bytes.byteLength,
    });
  }
}

function requireAllowed(options: RecompressRun): void {
  if (options.nodeEnv !== 'production' || options.confirmed || options.dryRun) return;
  throw new RecompressImagesRefusedError(options.nodeEnv);
}

function emptyReport(examined: number): RecompressReport {
  return { examined, converted: 0, skipped: 0, failed: [], bytesBefore: 0, bytesAfter: 0 };
}

function withOutcome(
  report: RecompressReport,
  assetId: string,
  outcome: RecompressOutcome,
): RecompressReport {
  if (outcome.kind === 'skipped') return { ...report, skipped: report.skipped + 1 };
  if (outcome.kind === 'failed') {
    return { ...report, failed: [...report.failed, { assetId, reason: outcome.reason }] };
  }
  return {
    ...report,
    converted: report.converted + 1,
    bytesBefore: report.bytesBefore + outcome.before,
    bytesAfter: report.bytesAfter + outcome.after,
  };
}
