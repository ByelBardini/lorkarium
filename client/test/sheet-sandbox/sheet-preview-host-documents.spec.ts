import type { SheetManifestPermissionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SHEET_DOCUMENT_READ_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import { createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { VHARN } from '../support/campaigns-api-fake';
import { DocumentsApiFake } from '../support/documents-api-fake';
import { DOCUMENT_ID, documentFixture, summaryOfDocument } from '../support/documents-fixtures';
import { LibraryApiFake } from '../support/library-api-fake';
import { vharnLibrary } from '../support/library-fixtures';
import { settledHost } from '../support/sheet-bridge-harness';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

const DOCUMENTS: readonly SheetManifestPermissionDto[] = ['documents:read'];
const list = { type: 'documents.list', requestId: '2' };

function previewWith(
  options: Readonly<{ permissions?: readonly SheetManifestPermissionDto[]; withTable?: boolean }>,
) {
  const port = new SheetHostPortFake();
  const library = new LibraryApiFake().answer('list', {
    ok: true,
    value: vharnLibrary({
      documents: [summaryOfDocument(documentFixture({ name: 'Bestiário', visibility: 'public' }))],
    }),
  });
  const sources = { library, documents: new DocumentsApiFake() };
  let clock = 0;
  const host = createSheetPreviewHost(port, {
    permissions: options.permissions ?? DOCUMENTS,
    now: () => clock,
    ...(options.withTable === false ? {} : { documents: { sources, campaignId: VHARN.id } }),
  });
  port.fromFrame({ type: 'ready', requestId: '1' });
  return { port, library, host, advance: (ms: number) => (clock += ms) };
}

const codesOf = (port: SheetHostPortFake): string[] => port.ofType('error').map(({ code }) => code);

describe('sheet preview host: documents', () => {
  it("reads the real table's public documents", async () => {
    const { port, library } = previewWith({});
    port.fromFrame(list);
    await settledHost();
    expect({
      table: library.calls.map(({ args }) => args[0]),
      results: port.ofType('result').filter(({ requestId }) => requestId === '2'),
    }).toEqual({
      table: [VHARN.id],
      results: [
        {
          type: 'result',
          requestId: '2',
          value: { documents: [{ id: DOCUMENT_ID, name: 'Bestiário', folderPath: [] }] },
        },
      ],
    });
  });

  it('without documents:read in the draft manifest is PERMISSION_NOT_DECLARED, read nothing', async () => {
    const { port, library } = previewWith({ permissions: [] });
    port.fromFrame(list);
    await settledHost();
    expect({ codes: codesOf(port), calls: library.calls.length }).toEqual({
      codes: ['PERMISSION_NOT_DECLARED'],
      calls: 0,
    });
  });

  it('a preview with no table answers PREVIEW_ONLY', async () => {
    const { port } = previewWith({ withTable: false });
    port.fromFrame(list);
    await settledHost();
    expect(codesOf(port)).toEqual(['PREVIEW_ONLY']);
  });

  it('keeps the room pace: one read past the limit is RATE_LIMITED, and the window reopens', async () => {
    const { port, library, advance } = previewWith({});
    for (let index = 0; index <= SHEET_DOCUMENT_READ_RATE.limit; index += 1) port.fromFrame(list);
    await settledHost();
    const limited = codesOf(port);
    advance(SHEET_DOCUMENT_READ_RATE.windowMs);
    port.fromFrame(list);
    await settledHost();
    expect({ limited, reads: library.calls.length }).toEqual({
      limited: ['RATE_LIMITED'],
      reads: SHEET_DOCUMENT_READ_RATE.limit + 1,
    });
  });

  it('an answer arriving after dispose posts nothing', async () => {
    const { port, host } = previewWith({});
    const before = port.sent.length;
    port.fromFrame(list);
    host.dispose();
    await settledHost();
    expect(port.sent.length).toBe(before);
  });
});
