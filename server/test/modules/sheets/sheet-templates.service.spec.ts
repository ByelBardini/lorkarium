import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SheetTemplatesService } from '../../../src/modules/sheets/sheet-templates.service';
import { lyraPortraitPo } from '../../support/assets-factories';
import { BIA_ID, DUDA_ID, QUELM_ID } from '../../support/campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import {
  QUELM_TEMPLATE_ID,
  SHEET_TEMPLATE_CODE,
  SheetTemplatesHarness,
  TORMENTA_ID,
  sheetTemplatePo,
} from '../../support/sheet-templates-fakes';

function withTormenta(): SheetTemplatesHarness {
  const harness = new SheetTemplatesHarness();
  harness.templates.rows.push(sheetTemplatePo({ folderId: ATO_1_ID, version: 2 }));
  return harness;
}

describe('SheetTemplatesService', () => {
  it('Ana creates "Ficha Tormenta" in the folder Sistemas: lock, insert, commit, then publish', async () => {
    const harness = new SheetTemplatesHarness();
    const service = new SheetTemplatesService(harness.deps);

    const template = await service.create(harness.requester, {
      name: 'Ficha Tormenta',
      folderId: ATO_1_ID,
      ...SHEET_TEMPLATE_CODE,
    });

    expect(template).toMatchObject({ name: 'Ficha Tormenta', folderId: ATO_1_ID, version: 0 });
    expect(template.files).toEqual(SHEET_TEMPLATE_CODE.files);
    expect(harness.journal).toEqual(['lock', 'insert', 'commit', 'publish']);
  });

  it('a template with no name nor folder is "Modelo sem nome" at the root', async () => {
    const harness = new SheetTemplatesHarness();

    const template = await new SheetTemplatesService(harness.deps).create(
      harness.requester,
      SHEET_TEMPLATE_CODE,
    );

    expect(template).toMatchObject({ name: 'Modelo sem nome', folderId: null });
  });

  it('a declared manifest is stored as it came; none stores one that declares nothing', async () => {
    const harness = new SheetTemplatesHarness();
    const service = new SheetTemplatesService(harness.deps);
    const manifest = {
      permissions: ['character:stats' as const],
      bars: [{ label: 'HP', color: 'ember' as const, max: 12 }],
      assets: [],
    };

    const declared = await service.create(harness.requester, { ...SHEET_TEMPLATE_CODE, manifest });
    const stored = harness.templates.rows.at(-1)?.manifest;
    const bare = await service.create(harness.requester, SHEET_TEMPLATE_CODE);

    expect(declared.manifest).toEqual(manifest);
    expect(stored).toEqual(manifest);
    expect(bare.manifest).toEqual({ permissions: [], bars: [], assets: [] });
  });

  it('saving only the manifest keeps the code and bumps the version to 3', async () => {
    const harness = withTormenta();
    const manifest = { permissions: ['sheet:images' as const], bars: [], assets: [] };

    const saved = await new SheetTemplatesService(harness.deps).update(
      harness.requester,
      TORMENTA_ID,
      { expectedVersion: 2, manifest },
    );

    expect(saved).toMatchObject({ version: 3, manifest, files: SHEET_TEMPLATE_CODE.files });
    expect(harness.journal).toEqual(['lock', 'update', 'commit', 'publish']);
  });

  it('saving five files at the version read keeps their order and bumps the version to 3', async () => {
    const harness = withTormenta();
    const files = [
      { path: 'index.html', content: '<p></p>' },
      { path: 'paginas/perfil.html', content: '<h2>Perfil</h2>' },
      { path: 'estilo.css', content: '' },
      { path: 'b.js', content: 'lorkarium.ready();' },
      { path: 'a.js', content: '' },
    ];

    const saved = await new SheetTemplatesService(harness.deps).update(
      harness.requester,
      TORMENTA_ID,
      { expectedVersion: 2, files },
    );

    expect(saved).toMatchObject({ version: 3, files, name: 'Ficha Tormenta' });
    expect(saved.updatedAt).toBe('2026-10-31T15:00:00.000Z');
    expect(harness.journal).toEqual(['lock', 'update', 'commit', 'publish']);
  });

  it("a save over another master's save is SHEET_TEMPLATE_VERSION_CONFLICT and publishes nothing", async () => {
    const harness = withTormenta();

    const save = new SheetTemplatesService(harness.deps).update(harness.requester, TORMENTA_ID, {
      expectedVersion: 1,
      name: 'Velha',
    });

    await expect(save).rejects.toMatchObject({ code: 'SHEET_TEMPLATE_VERSION_CONFLICT' });
    expect(harness.templates.rows.find(({ id }) => id === TORMENTA_ID)?.name).toBe(
      'Ficha Tormenta',
    );
    expect(harness.journal).toEqual(['lock']);
  });

  it('moving it with folderId null takes it to the root', async () => {
    const harness = withTormenta();

    const saved = await new SheetTemplatesService(harness.deps).update(
      harness.requester,
      TORMENTA_ID,
      { expectedVersion: 2, folderId: null },
    );

    expect(saved.folderId).toBeNull();
  });

  it('a template without sheets is deleted and the table hears library:changed', async () => {
    const harness = withTormenta();

    await new SheetTemplatesService(harness.deps).delete(harness.requester, TORMENTA_ID);

    expect(harness.templates.rows.map(({ id }) => id)).toEqual([QUELM_TEMPLATE_ID]);
    expect(harness.journal).toEqual(['lock', 'delete', 'commit', 'publish']);
  });

  it('a template with 2 sheets is SHEET_TEMPLATE_IN_USE citing "2 sheets" and stays', async () => {
    const harness = withTormenta();
    harness.uses.counts.set(TORMENTA_ID, 2);

    const deletion = new SheetTemplatesService(harness.deps).delete(harness.requester, TORMENTA_ID);

    await expect(deletion).rejects.toMatchObject({
      code: 'SHEET_TEMPLATE_IN_USE',
      message: expect.stringContaining('2 sheets'),
    });
    expect(harness.templates.rows).toHaveLength(2);
    expect(harness.journal).not.toContain('publish');
  });

  it.each([
    [
      'create',
      (service: SheetTemplatesService, requester: { campaignId: string; userId: string }) =>
        service.create(requester, SHEET_TEMPLATE_CODE),
    ],
    [
      'edit',
      (service: SheetTemplatesService, requester: { campaignId: string; userId: string }) =>
        service.update(requester, TORMENTA_ID, { expectedVersion: 2, name: 'X' }),
    ],
    [
      'read',
      (service: SheetTemplatesService, requester: { campaignId: string; userId: string }) =>
        service.get(requester, TORMENTA_ID),
    ],
    [
      'delete',
      (service: SheetTemplatesService, requester: { campaignId: string; userId: string }) =>
        service.delete(requester, TORMENTA_ID),
    ],
  ])('Bia trying to %s a template is FORBIDDEN before any lock', async (_action, run) => {
    const harness = withTormenta();

    await expect(
      run(new SheetTemplatesService(harness.deps), harness.as(BIA_ID)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.journal).toEqual([]);
  });

  it('Duda, a spectator, reading the code is FORBIDDEN', async () => {
    const harness = withTormenta();

    const read = new SheetTemplatesService(harness.deps).get(harness.as(DUDA_ID), TORMENTA_ID);

    await expect(read).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a folder of Quelm is FOLDER_NOT_FOUND and nothing is inserted', async () => {
    const harness = new SheetTemplatesHarness();

    const creation = new SheetTemplatesService(harness.deps).create(harness.requester, {
      folderId: QUELM_FOLDER_ID,
      ...SHEET_TEMPLATE_CODE,
    });

    await expect(creation).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(harness.journal).toEqual(['lock']);
  });

  it('the template of Quelm asked by its id at Vharn is SHEET_TEMPLATE_NOT_FOUND', async () => {
    const harness = new SheetTemplatesHarness();

    const read = new SheetTemplatesService(harness.deps).get(harness.requester, QUELM_TEMPLATE_ID);

    await expect(read).rejects.toMatchObject({ code: 'SHEET_TEMPLATE_NOT_FOUND' });
  });

  it('a failed commit rolls the template back and never publishes', async () => {
    const harness = new SheetTemplatesHarness();
    harness.failCommit = true;

    const creation = new SheetTemplatesService(harness.deps).create(
      harness.requester,
      SHEET_TEMPLATE_CODE,
    );

    await expect(creation).rejects.toThrow('commit failed');
    expect(harness.templates.rows.map(({ id }) => id)).toEqual([QUELM_TEMPLATE_ID]);
    expect(harness.journal).not.toContain('publish');
  });

  describe('the assets the manifest declares', () => {
    const FONT_ID = '00000000-0000-4000-8000-0000000000f1';
    const font = (overrides = {}) =>
      lyraPortraitPo({
        id: FONT_ID,
        purpose: 'sheet_template_asset',
        mimeType: 'font/woff2',
        sizeBytes: 40_000,
        width: 0,
        height: 0,
        ...overrides,
      });
    const declaring = (path = 'fontes/cormorant.woff2') => ({
      permissions: [],
      bars: [],
      assets: [{ path, assetId: FONT_ID }],
    });

    it('a template asset of the table is saved in the manifest', async () => {
      const harness = withTormenta();
      harness.assets.rows.push(font());

      const saved = await new SheetTemplatesService(harness.deps).update(
        harness.requester,
        TORMENTA_ID,
        {
          expectedVersion: 2,
          manifest: declaring(),
        },
      );

      expect(saved.manifest.assets).toEqual(declaring().assets);
    });

    it.each([
      ['missing', null],
      ['of Quelm', { campaignId: QUELM_ID }],
      ['a token portrait', { purpose: 'token' as const }],
    ])(
      'an asset %s is SHEET_TEMPLATE_ASSET_NOT_FOUND and nothing is saved nor published',
      async (_what, change) => {
        const harness = withTormenta();
        if (change) harness.assets.rows.push(font(change));

        const save = new SheetTemplatesService(harness.deps).update(
          harness.requester,
          TORMENTA_ID,
          {
            expectedVersion: 2,
            manifest: declaring(),
          },
        );

        await expect(save).rejects.toMatchObject({ code: 'SHEET_TEMPLATE_ASSET_NOT_FOUND' });
        expect(harness.templates.rows.find(({ id }) => id === TORMENTA_ID)?.version).toBe(2);
        expect(harness.journal).not.toContain('publish');
      },
    );

    it('assets past 8 MiB on create are SHEET_TEMPLATE_ASSETS_TOO_LARGE', async () => {
      const harness = new SheetTemplatesHarness();
      harness.assets.rows.push(font({ sizeBytes: 8 * 1024 * 1024 + 1 }));

      const create = new SheetTemplatesService(harness.deps).create(harness.requester, {
        ...SHEET_TEMPLATE_CODE,
        manifest: declaring(),
      });

      await expect(create).rejects.toMatchObject({ code: 'SHEET_TEMPLATE_ASSETS_TOO_LARGE' });
    });
  });

  describe("the owner's plan", () => {
    const FREE = { role: 'user', plan: 'free', lorkariumOwner: false } as const;

    it('a free table with one template refuses the 2nd with PLAN_LIMIT sheetTemplates, writing nothing', async () => {
      const harness = withTormenta();
      harness.campaigns.owner = FREE;

      const create = new SheetTemplatesService(harness.deps).create(
        harness.requester,
        SHEET_TEMPLATE_CODE,
      );

      await expect(create).rejects.toMatchObject({
        code: 'PLAN_LIMIT',
        resource: 'sheetTemplates',
        limit: 1,
        plan: 'free',
      });
      expect(harness.journal).toEqual(['lock']);
    });

    it("a free table's first template is created; Quelm's template does not count", async () => {
      const harness = new SheetTemplatesHarness();
      harness.campaigns.owner = FREE;

      await new SheetTemplatesService(harness.deps).create(harness.requester, SHEET_TEMPLATE_CODE);

      expect(harness.journal).toEqual(['lock', 'insert', 'commit', 'publish']);
    });

    it('an admin owner on free creates past the free ceiling', async () => {
      const harness = withTormenta();
      harness.campaigns.owner = { ...FREE, role: 'admin' };

      await new SheetTemplatesService(harness.deps).create(harness.requester, SHEET_TEMPLATE_CODE);

      expect(harness.journal).toEqual(['lock', 'insert', 'commit', 'publish']);
    });

    it('editing a template past the ceiling still saves (who is past keeps what it has)', async () => {
      const harness = withTormenta();
      harness.templates.rows.push(sheetTemplatePo({ id: randomUUID(), name: 'Outra' }));
      harness.campaigns.owner = FREE;

      const saved = await new SheetTemplatesService(harness.deps).update(
        harness.requester,
        TORMENTA_ID,
        { expectedVersion: 2, name: 'Tormenta 2' },
      );

      expect(saved.name).toBe('Tormenta 2');
    });
  });
});
