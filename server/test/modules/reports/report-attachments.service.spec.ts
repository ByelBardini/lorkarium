import { beforeEach, describe, expect, it } from 'vitest';
import { ReportAttachmentsService } from '../../../src/modules/reports/report-attachments.service';
import { AssetStorageFake, ImageProcessorFake } from '../../support/assets-fakes';
import { BIA_ID } from '../../support/campaigns-factories';
import {
  ReportAttachmentsDaoFake,
  ReportsDaoFake,
  ReportsTransactionFake,
  reportAttachmentPo,
} from '../../support/reports-fakes';

const NEW_ID = '00000000-0000-4000-8000-0000000000c1';
const REPORT_ID = '00000000-0000-4000-8000-0000000000d1';
const OTHER_REPORT_ID = '00000000-0000-4000-8000-0000000000d2';
const MAX_BYTES = 5 * 1024 * 1024;

/** A bucket whose `put` fails: the row written before it must not stay. */
class FailingPutStorageFake extends AssetStorageFake {
  override async put(): Promise<void> {
    throw new Error('bucket down');
  }
}

let attachments: ReportAttachmentsDaoFake;
let storage: AssetStorageFake;
let processor: ImageProcessorFake;

function serviceOver(bucket: AssetStorageFake = storage): ReportAttachmentsService {
  const transaction = new ReportsTransactionFake(new ReportsDaoFake(), attachments);
  return new ReportAttachmentsService({
    transaction: (work) => transaction.run(() => work(attachments)),
    attachments,
    storage: bucket,
    processor,
    newId: () => NEW_ID,
    limits: { maxBytes: MAX_BYTES, maxSide: 4096 },
  });
}

beforeEach(() => {
  attachments = new ReportAttachmentsDaoFake();
  storage = new AssetStorageFake();
  processor = new ImageProcessorFake();
  processor.result = { ...processor.result, mimeType: 'image/webp', width: 1280, height: 720 };
});

describe('ReportAttachmentsService.upload', () => {
  it('keeps the normalized image loose under reports/<id> and answers its id and pixels', async () => {
    const attachment = await serviceOver().upload(BIA_ID, Uint8Array.from([1, 2, 3]));

    expect(attachment).toEqual({
      id: NEW_ID,
      mimeType: 'image/webp',
      width: 1280,
      height: 720,
      sizeBytes: 6,
    });
    expect(storage.objects.get(`reports/${NEW_ID}`)?.contentType).toBe('image/webp');
    expect(attachments.rows).toMatchObject([{ id: NEW_ID, uploadedBy: BIA_ID, reportId: null }]);
  });

  it('asks the processor for the 4096 px side with opaque images as WebP', async () => {
    await serviceOver().upload(BIA_ID, Uint8Array.from([1]));

    expect(processor.resizes).toEqual([{ maxSide: 4096, opaqueAsWebp: true }]);
  });

  it('a body past 5 MiB is ATTACHMENT_TOO_LARGE before it is decoded', async () => {
    const upload = serviceOver().upload(BIA_ID, new Uint8Array(MAX_BYTES + 1));

    await expect(upload).rejects.toMatchObject({ code: 'ATTACHMENT_TOO_LARGE' });
    expect(processor.resizes).toEqual([]);
  });

  it('bytes the processor refuses are UNSUPPORTED_IMAGE with its detail and nothing is kept', async () => {
    processor.refusal = { reason: 'not-an-image', detail: 'the 3 bytes do not decode' };

    const upload = serviceOver().upload(BIA_ID, Uint8Array.from([1, 2, 3]));

    await expect(upload).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE',
      message: expect.stringContaining('the 3 bytes do not decode'),
    });
    expect(attachments.rows).toEqual([]);
    expect(storage.objects.size).toBe(0);
  });

  it('a put that fails leaves no row behind', async () => {
    const upload = serviceOver(new FailingPutStorageFake()).upload(BIA_ID, Uint8Array.from([1]));

    await expect(upload).rejects.toThrow('bucket down');
    expect(attachments.rows).toEqual([]);
  });
});

describe('ReportAttachmentsService.open', () => {
  it("a screenshot of the report comes back with the row's type", async () => {
    attachments.rows.push(reportAttachmentPo({ id: NEW_ID, reportId: REPORT_ID }));
    await storage.put(`reports/${NEW_ID}`, Uint8Array.from([7, 7]), 'image/webp');

    const opened = await serviceOver().open(REPORT_ID, NEW_ID);

    expect({ size: opened.size, mimeType: opened.mimeType }).toEqual({
      size: 2,
      mimeType: 'image/webp',
    });
  });

  it.each([
    ['of another report', OTHER_REPORT_ID],
    ['still loose', null],
  ])('a screenshot %s is ATTACHMENT_NOT_FOUND', async (_label, reportId) => {
    attachments.rows.push(reportAttachmentPo({ id: NEW_ID, reportId }));
    await storage.put(`reports/${NEW_ID}`, Uint8Array.from([7]), 'image/webp');

    await expect(serviceOver().open(REPORT_ID, NEW_ID)).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_FOUND',
    });
  });

  it('a row whose object is gone from the bucket is the same ATTACHMENT_NOT_FOUND', async () => {
    attachments.rows.push(reportAttachmentPo({ id: NEW_ID, reportId: REPORT_ID }));

    await expect(serviceOver().open(REPORT_ID, NEW_ID)).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_FOUND',
    });
  });
});
