import { describe, expect, it } from 'vitest';
import {
  createSheetTemplateDraftStore,
  isTemplateDraftDirty,
  sourceBytes,
} from '@/stores/sheet-template-draft-store';
import { VHARN } from '../support/campaigns-api-fake';
import { TORMENTA_TEMPLATE_ID } from '../support/sheet-fixtures';
import { tormentaTemplate } from '../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../support/sheet-templates-api-fake';

async function readTormenta() {
  const api = new SheetTemplatesApiFake();
  const draft = createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  await draft.getState().start();
  return { api, draft };
}

describe('sourceBytes', () => {
  it('counts UTF-8 bytes of html + css + js, not characters, and ignores the name', () => {
    expect(sourceBytes({ name: 'Ficha Tormenta', html: 'é', css: '€', js: 'a' })).toBe(6);
  });
});

describe('sheet template draft store', () => {
  it('start reads the template once, however many editors start it', async () => {
    const { api, draft } = await readTormenta();
    await draft.getState().start();
    expect(api.detailCalls).toEqual([TORMENTA_TEMPLATE_ID]);
    expect(draft.getState()).toMatchObject({ load: 'ready', draft: { html: '<p id="pv">PV</p>' } });
  });

  it('a template that is gone reads as `not_found`; another failure as `failed`', async () => {
    const api = new SheetTemplatesApiFake();
    api.templates.clear();
    const scope = { api, campaignId: VHARN.id, templateId: TORMENTA_TEMPLATE_ID };
    const gone = createSheetTemplateDraftStore(scope);
    await gone.getState().start();
    expect(gone.getState()).toMatchObject({ load: 'not_found', failure: 'not_found' });
    api.detailResult = { ok: false, failure: { kind: 'offline' } };
    const offline = createSheetTemplateDraftStore(scope);
    await offline.getState().start();
    expect(offline.getState()).toMatchObject({ load: 'failed', failure: 'offline' });
  });

  it('refresh with nothing unsaved takes a newer version saved elsewhere', async () => {
    const { api, draft } = await readTormenta();
    api.templates.set(TORMENTA_TEMPLATE_ID, tormentaTemplate({ version: 4, html: '<p>dele</p>' }));
    await draft.getState().refresh();
    expect(draft.getState().base?.version).toBe(4);
    expect(draft.getState().draft.html).toBe('<p>dele</p>');
  });

  it('refresh never replaces unsaved text: the save meets the conflict instead', async () => {
    const { api, draft } = await readTormenta();
    draft.getState().edit({ html: '<p>meu</p>' });
    api.templates.set(TORMENTA_TEMPLATE_ID, tormentaTemplate({ version: 4, html: '<p>dele</p>' }));
    await draft.getState().refresh();
    expect(draft.getState().draft.html).toBe('<p>meu</p>');
    expect(draft.getState().base?.version).toBe(3);
  });

  it('refresh of a deleted template turns it `not_found`', async () => {
    const { api, draft } = await readTormenta();
    api.templates.delete(TORMENTA_TEMPLATE_ID);
    await draft.getState().refresh();
    expect(draft.getState().load).toBe('not_found');
  });

  it('refresh before the first read sends nothing', async () => {
    const api = new SheetTemplatesApiFake();
    const draft = createSheetTemplateDraftStore({
      api,
      campaignId: VHARN.id,
      templateId: TORMENTA_TEMPLATE_ID,
    });
    await draft.getState().refresh();
    expect(api.detailCalls).toEqual([]);
  });

  it('discard puts the version read back and leaves nothing unsaved', async () => {
    const { draft } = await readTormenta();
    draft.getState().edit({ html: '<p>meu</p>', name: 'Ficha T20' });
    expect(isTemplateDraftDirty(draft.getState())).toBe(true);
    draft.getState().discard();
    expect(isTemplateDraftDirty(draft.getState())).toBe(false);
    expect(draft.getState().draft).toMatchObject({
      name: 'Ficha Tormenta',
      html: '<p id="pv">PV</p>',
    });
  });

  it('a blank name is no change', async () => {
    const { draft } = await readTormenta();
    draft.getState().edit({ name: '  ' });
    expect(isTemplateDraftDirty(draft.getState())).toBe(false);
  });
});
