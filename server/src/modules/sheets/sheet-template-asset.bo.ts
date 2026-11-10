import { SheetTemplateAssetNotFoundError, SheetTemplateAssetsTooLargeError } from './sheets.error';

/** A manifest entry: where the template names the asset and the stored asset. */
export type DeclaredTemplateAsset = Readonly<{ path: string; assetId: string }>;

/** What the rule reads of a stored asset of the table. */
export type StoredTemplateAsset = Readonly<{ id: string; purpose: string; sizeBytes: number }>;

/** The rule of the assets a template manifest declares: each must be a `sheet_template_asset` of
 *  the same table (the DAO only finds the table's own), and together they fit the budget, each
 *  asset counted once even if two paths name it.
 *
 *  Example: `new SheetTemplateAssetBo(campaignId, SHEET_TEMPLATE_ASSETS_MAX_BYTES).requireDeclared(manifest.assets, rows)` */
export class SheetTemplateAssetBo {
  constructor(
    private readonly campaignId: string,
    private readonly maxBytes: number,
  ) {}

  requireDeclared(
    declared: readonly DeclaredTemplateAsset[],
    stored: readonly StoredTemplateAsset[],
  ): void {
    const byId = new Map(stored.map((asset) => [asset.id, asset]));
    for (const { path, assetId } of declared) {
      if (byId.get(assetId)?.purpose === 'sheet_template_asset') continue;
      throw new SheetTemplateAssetNotFoundError(this.campaignId, path, assetId);
    }
    const ids = new Set(declared.map(({ assetId }) => assetId));
    const bytes = [...ids].reduce((sum, id) => sum + (byId.get(id)?.sizeBytes ?? 0), 0);
    if (bytes > this.maxBytes) throw new SheetTemplateAssetsTooLargeError(bytes, this.maxBytes);
  }
}
