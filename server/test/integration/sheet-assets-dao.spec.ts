import { sheetTemplateResponseDto, sheetWriteResponseDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SheetAssetsDao } from '../../src/modules/sheets/sheet-assets.dao';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };

async function sheetIdOf(user: SignedInUser, table: Table): Promise<string> {
  const templates = `/api/campaigns/${table.id}/sheet-templates`;
  const template = await live.http(user, { method: 'POST', url: templates, payload: CODE });
  const templateId = sheetTemplateResponseDto.parse(template.json()).template.id;
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Ficha' };
  const url = `/api/campaigns/${table.id}/sheets`;
  const response = await live.http(user, { method: 'POST', url, payload });
  return sheetWriteResponseDto.parse(response.json()).sheet.id;
}

function dao(): SheetAssetsDao {
  return new SheetAssetsDao(live.connection.db);
}

describe('SheetAssetsDao on Postgres', () => {
  it('tying an image twice to a sheet keeps one tie', async () => {
    const sheetId = await sheetIdOf(live.ana, live.vharn);
    const asset = await live.sendImage(live.ana, live.vharn);

    await dao().associate(live.vharn.id, sheetId, asset.id);
    await dao().associate(live.vharn.id, sheetId, asset.id);

    expect(await dao().sheetsOfAsset(live.vharn.id, asset.id)).toEqual([sheetId]);
  });

  it("the ties of Vharn's image are not found under Quelm", async () => {
    const sheetId = await sheetIdOf(live.ana, live.vharn);
    const asset = await live.sendImage(live.ana, live.vharn);
    await dao().associate(live.vharn.id, sheetId, asset.id);

    expect(await dao().sheetsOfAsset(live.quelm.id, asset.id)).toEqual([]);
  });

  it('an image of Vharn cannot be tied to a sheet of Quelm (the campaign is in each key)', async () => {
    const quelmSheet = await sheetIdOf(live.caio, live.quelm);
    const asset = await live.sendImage(live.ana, live.vharn);

    await expect(dao().associate(live.quelm.id, quelmSheet, asset.id)).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });

  it('deleting the sheet drops its ties', async () => {
    const sheetId = await sheetIdOf(live.ana, live.vharn);
    const asset = await live.sendImage(live.ana, live.vharn);
    await dao().associate(live.vharn.id, sheetId, asset.id);
    const url = `/api/campaigns/${live.vharn.id}/sheets/${sheetId}`;
    await live.http(live.ana, {
      method: 'DELETE',
      url,
      payload: { actionId: crypto.randomUUID() },
    });

    expect(await dao().sheetsOfAsset(live.vharn.id, asset.id)).toEqual([]);
  });
});
