import type { SheetManifestAssetDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import { bytesToBase64 } from '@/lib/base64';
import type { SheetTemplateAssetReader } from '@/services/sheet-templates-api';
import type { SheetAssetData } from '@/sheet-sandbox/sheet-page-assembly';

/** The assets of a template as the frame embeds them: `ready` with the data by path, `loading`,
 *  or `failed` naming the first path that could not be read. */
export type SheetAssetLoad =
  | Readonly<{ status: 'ready'; assets: ReadonlyMap<string, SheetAssetData> }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'failed'; path: string }>;

const NO_ASSETS: SheetAssetLoad = { status: 'ready', assets: new Map() };
const LOADING: SheetAssetLoad = { status: 'loading' };

/** The ids whose data stays in memory per reader; past it the least recently used leaves. */
export const SHEET_ASSET_READS_LIMIT = 32;

// The bytes of an id never change: one read per reader and id, shared by the room and the preview.
const reads = new WeakMap<SheetTemplateAssetReader, Map<string, Promise<SheetAssetData | null>>>();

function readOnce(
  reader: SheetTemplateAssetReader,
  assetId: string,
): Promise<SheetAssetData | null> {
  const known = reads.get(reader) ?? new Map<string, Promise<SheetAssetData | null>>();
  reads.set(reader, known);
  const cached = known.get(assetId);
  // A Map iterates in insertion order: put back at the end, the id is the newest again.
  if (cached) return keptNewest(known, assetId, cached);
  const read = reader.asset(assetId).then((result) => {
    if (result.ok)
      return { type: result.value.type, base64: bytesToBase64(new Uint8Array(result.value.bytes)) };
    known.delete(assetId);
    return null;
  });
  keptNewest(known, assetId, read);
  return read;
}

function keptNewest<T>(known: Map<string, T>, assetId: string, read: T): T {
  known.delete(assetId);
  known.set(assetId, read);
  const oldest = known.keys().next();
  if (known.size > SHEET_ASSET_READS_LIMIT && !oldest.done) known.delete(oldest.value);
  return read;
}

/** Reads every declared asset (once per id) and turns it into the data the srcdoc embeds.
 *
 *  Example: `await loadSheetAssetData(api, manifest.assets) // { status: 'ready', assets }` */
export async function loadSheetAssetData(
  reader: SheetTemplateAssetReader | undefined,
  declared: readonly SheetManifestAssetDto[],
): Promise<SheetAssetLoad> {
  const [first] = declared;
  if (!first) return NO_ASSETS;
  if (!reader) return { status: 'failed', path: first.path };
  const data = await Promise.all(declared.map(({ assetId }) => readOnce(reader, assetId)));
  const missing = declared.find((_, at) => data[at] === null);
  if (missing) return { status: 'failed', path: missing.path };
  const assets = new Map(declared.map(({ path }, at) => [path, data[at] as SheetAssetData]));
  return { status: 'ready', assets };
}

/** `loadSheetAssetData` kept in step with the declared list: the same map (by identity) while the
 *  list stays the same, so the frame is not rebuilt by a re-render.
 *
 *  Example: `const load = useSheetAssetData(deps.sheetTemplatesApi, template.manifest.assets)` */
export function useSheetAssetData(
  reader: SheetTemplateAssetReader | undefined,
  declared: readonly SheetManifestAssetDto[],
): SheetAssetLoad {
  const key = JSON.stringify(declared.map(({ path, assetId }) => [path, assetId]));
  const [shown, setShown] = useState<Readonly<{ key: string; load: SheetAssetLoad }>>({
    key: '[]',
    load: NO_ASSETS,
  });
  useEffect(() => {
    let alive = true;
    const entries = (JSON.parse(key) as [string, string][]).map(([path, assetId]) => ({
      path,
      assetId,
    }));
    void loadSheetAssetData(reader, entries).then((load) => {
      if (alive) setShown({ key, load });
    });
    return () => {
      alive = false;
    };
  }, [key, reader]);
  if (key === '[]') return NO_ASSETS;
  return shown.key === key ? shown.load : LOADING;
}
