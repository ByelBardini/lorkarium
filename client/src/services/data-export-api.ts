import { DATA_EXPORT_TOO_SOON_CODE, apiErrorDto } from '@lorkarium/contracts';

/** Why the archive did not come: asked again within the day, no network, or anything else. */
export type DataExportFailure =
  | Readonly<{ kind: 'too_soon'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

/** The ZIP as the server named it. */
export type DataExportArchive = Readonly<{ fileName: string; blob: Blob }>;

export type DataExportResult =
  | Readonly<{ ok: true; value: DataExportArchive }>
  | Readonly<{ ok: false; failure: DataExportFailure }>;

/** `GET /api/account/export`: the session's own data as a ZIP, once a day. Never throws. */
export interface DataExportApi {
  exportData(): Promise<DataExportResult>;
}

const EXPORT_URL = '/api/account/export';
const FALLBACK_FILE_NAME = 'lorkarium-dados.zip';
const FILE_NAME_IN_DISPOSITION = /filename="([^"]+)"/;

/** `DataExportApi` over `fetch`: the body is read as bytes (a `Blob`), not JSON, so it does not
 *  pass through the JSON transport of the other services.
 *
 *  Example: `const result = await new HttpDataExportApi().exportData(); if (result.ok) save(result.value)` */
export class HttpDataExportApi implements DataExportApi {
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  async exportData(): Promise<DataExportResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(EXPORT_URL, { credentials: 'same-origin' });
    } catch {
      return { ok: false, failure: { kind: 'offline' } };
    }
    if (response.ok) return { ok: true, value: await archiveOf(response) };
    return { ok: false, failure: await refusalOf(response) };
  }
}

async function archiveOf(response: Response): Promise<DataExportArchive> {
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = FILE_NAME_IN_DISPOSITION.exec(disposition)?.[1] ?? FALLBACK_FILE_NAME;
  return { fileName, blob: await response.blob() };
}

async function refusalOf(response: Response): Promise<DataExportFailure> {
  const body = apiErrorDto.safeParse(await response.json().catch(() => null));
  if (!body.success || body.data.code !== DATA_EXPORT_TOO_SOON_CODE) return { kind: 'unexpected' };
  const fromHeader = Number(response.headers.get('retry-after'));
  const retryAfterSeconds = body.data.retryAfterSeconds ?? (fromHeader > 0 ? fromHeader : 0);
  return { kind: 'too_soon', retryAfterSeconds };
}
