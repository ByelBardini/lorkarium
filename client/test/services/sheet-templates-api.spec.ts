import { describe, expect, it } from 'vitest';
import { HttpSheetTemplatesApi } from '@/services/sheet-templates-api';
import { VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';
import { TORMENTA_TEMPLATE_ID } from '../support/sheet-fixtures';
import { tormentaTemplate } from '../support/sheet-template-fixtures';

const BASE = `/campaigns/${VHARN.id}/sheet-templates`;
const SOURCE = { html: '<p></p>', css: '', js: '' };

function refusal(code: string): Readonly<{ code: string; message: string }> {
  return { code, message: `refused with ${code}` };
}

describe('sheet templates HTTP API', () => {
  it('reads one template with its code by GET …/sheet-templates/:id', async () => {
    const transport = new HttpTransportFake().respondWith(200, { template: tormentaTemplate() });
    const result = await new HttpSheetTemplatesApi(transport).detail(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: true, value: tormentaTemplate() });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: `${BASE}/${TORMENTA_TEMPLATE_ID}`,
    });
  });

  it('creates by POST …/sheet-templates with the body as given', async () => {
    const created = tormentaTemplate({ version: 1 });
    const transport = new HttpTransportFake().respondWith(201, { template: created });
    const input = { name: 'Ficha Tormenta', folderId: null, ...SOURCE };
    const result = await new HttpSheetTemplatesApi(transport).create(VHARN.id, input);
    expect(result).toEqual({ ok: true, value: created });
    expect(transport.requests[0]).toEqual({ method: 'POST', path: BASE, body: input });
  });

  it('saves by PATCH …/:id with the expected version and the whole code', async () => {
    const transport = new HttpTransportFake().respondWith(200, {
      template: tormentaTemplate({ version: 4 }),
    });
    const input = { expectedVersion: 3, ...SOURCE };
    await new HttpSheetTemplatesApi(transport).update(VHARN.id, TORMENTA_TEMPLATE_ID, input);
    expect(transport.requests[0]).toEqual({
      method: 'PATCH',
      path: `${BASE}/${TORMENTA_TEMPLATE_ID}`,
      body: input,
    });
  });

  it('removes by DELETE …/:id and answers null on 204', async () => {
    const transport = new HttpTransportFake().respondWith(204, null);
    const result = await new HttpSheetTemplatesApi(transport).remove(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(transport.requests[0]?.method).toBe('DELETE');
  });

  it('a template answer over the code budget is unexpected, never trusted', async () => {
    const huge = tormentaTemplate({ js: 'x'.repeat(512 * 1024) });
    const transport = new HttpTransportFake().respondWith(200, { template: huge });
    const result = await new HttpSheetTemplatesApi(transport).detail(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    [409, 'SHEET_TEMPLATE_VERSION_CONFLICT', 'conflict'],
    [409, 'SHEET_TEMPLATE_IN_USE', 'in_use'],
    [404, 'FOLDER_NOT_FOUND', 'folder_not_found'],
    [404, 'SHEET_TEMPLATE_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'VALIDATION_FAILED', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'INTERNAL', 'unexpected'],
  ])('a %i with %s is %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, refusal(code));
    const result = await new HttpSheetTemplatesApi(transport).remove(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('the network down is offline', async () => {
    const transport = new HttpTransportFake().failWithNetworkDown();
    const result = await new HttpSheetTemplatesApi(transport).create(VHARN.id, SOURCE);
    expect(result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
