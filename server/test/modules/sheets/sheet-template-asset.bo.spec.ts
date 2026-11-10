import { describe, expect, it } from 'vitest';
import { SheetTemplateAssetBo } from '../../../src/modules/sheets/sheet-template-asset.bo';
import { VHARN_ID } from '../../support/campaigns-factories';

const FONT = '00000000-0000-4000-8000-000000000001';
const BRASAO = '00000000-0000-4000-8000-000000000002';
const MAX = 1000;

const font = { id: FONT, purpose: 'sheet_template_asset', sizeBytes: 600 };
const brasao = { id: BRASAO, purpose: 'sheet_template_asset', sizeBytes: 400 };

function rules(): SheetTemplateAssetBo {
  return new SheetTemplateAssetBo(VHARN_ID, MAX);
}

describe('SheetTemplateAssetBo.requireDeclared', () => {
  it('accepts the declared assets of the table up to exactly the budget', () =>
    expect(() =>
      rules().requireDeclared(
        [
          { path: 'fontes/x.woff2', assetId: FONT },
          { path: 'img/brasao.png', assetId: BRASAO },
        ],
        [font, brasao],
      ),
    ).not.toThrow());

  it('counts an asset named by two paths once', () =>
    expect(() =>
      rules().requireDeclared(
        [
          { path: 'a.png', assetId: BRASAO },
          { path: 'b.png', assetId: BRASAO },
        ],
        [{ ...brasao, sizeBytes: MAX }],
      ),
    ).not.toThrow());

  it('one byte past the budget is SHEET_TEMPLATE_ASSETS_TOO_LARGE citing both', () =>
    expect(() =>
      rules().requireDeclared(
        [
          { path: 'fontes/x.woff2', assetId: FONT },
          { path: 'img/brasao.png', assetId: BRASAO },
        ],
        [font, { ...brasao, sizeBytes: 401 }],
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'SHEET_TEMPLATE_ASSETS_TOO_LARGE',
        message: 'The template assets have 1001 bytes; expected at most 1000',
      }),
    ));

  it('an asset the table does not have is SHEET_TEMPLATE_ASSET_NOT_FOUND citing its path', () =>
    expect(() => rules().requireDeclared([{ path: 'img/sumiu.png', assetId: FONT }], [])).toThrow(
      expect.objectContaining({
        code: 'SHEET_TEMPLATE_ASSET_NOT_FOUND',
        message: expect.stringContaining('"img/sumiu.png"'),
      }),
    ));

  it('a token portrait of the table is not a template asset', () =>
    expect(() =>
      rules().requireDeclared(
        [{ path: 'img/retrato.png', assetId: BRASAO }],
        [{ ...brasao, purpose: 'token' }],
      ),
    ).toThrow(expect.objectContaining({ code: 'SHEET_TEMPLATE_ASSET_NOT_FOUND' })));

  it('no assets declared is always fine', () =>
    expect(() => rules().requireDeclared([], [])).not.toThrow());
});
