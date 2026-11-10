import { describe, expect, it } from 'vitest';
import {
  createSheetTemplateDraftStore,
  isTemplateDraftDirty,
  sourceBytes,
} from '@/stores/sheet-template-draft-store';
import { VHARN } from '../support/campaigns-api-fake';
import { TORMENTA_TEMPLATE_ID } from '../support/sheet-fixtures';
import {
  contentOf,
  tormentaFiles,
  tormentaTemplate,
  withContent,
} from '../support/sheet-template-fixtures';
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
  it('counts UTF-8 bytes of every file, not characters, and ignores the name and paths', () => {
    const files = [
      { path: 'index.html', content: 'é' },
      { path: 'a.css', content: '€' },
      { path: 'paginas/b.js', content: 'a' },
    ];
    expect(sourceBytes({ files })).toBe(6);
  });
});

describe('sheet template draft store', () => {
  it('start reads the template once, however many editors start it', async () => {
    const { api, draft } = await readTormenta();
    await draft.getState().start();
    expect(api.detailCalls).toEqual([TORMENTA_TEMPLATE_ID]);
    expect(draft.getState()).toMatchObject({ load: 'ready', draft: { files: tormentaFiles() } });
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
    api.templates.set(
      TORMENTA_TEMPLATE_ID,
      tormentaTemplate({
        version: 4,
        files: withContent(tormentaFiles(), 'index.html', '<p>dele</p>'),
      }),
    );
    await draft.getState().refresh();
    expect(draft.getState().base?.version).toBe(4);
    expect(contentOf(draft.getState().draft.files, 'index.html')).toBe('<p>dele</p>');
  });

  it('refresh never replaces unsaved text: the save meets the conflict instead', async () => {
    const { api, draft } = await readTormenta();
    draft.getState().edit({ files: withContent(tormentaFiles(), 'index.html', '<p>meu</p>') });
    api.templates.set(
      TORMENTA_TEMPLATE_ID,
      tormentaTemplate({
        version: 4,
        files: withContent(tormentaFiles(), 'index.html', '<p>dele</p>'),
      }),
    );
    await draft.getState().refresh();
    expect(contentOf(draft.getState().draft.files, 'index.html')).toBe('<p>meu</p>');
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
    draft.getState().edit({
      files: withContent(tormentaFiles(), 'index.html', '<p>meu</p>'),
      name: 'Ficha T20',
    });
    expect(isTemplateDraftDirty(draft.getState())).toBe(true);
    draft.getState().discard();
    expect(isTemplateDraftDirty(draft.getState())).toBe(false);
    expect(draft.getState().draft).toMatchObject({
      name: 'Ficha Tormenta',
      files: tormentaFiles(),
    });
  });

  it('the manifest reads as its JSON text, and editing it is a change', async () => {
    const { draft } = await readTormenta();
    expect(draft.getState().draft.manifest).toBe('{\n  "permissions": [],\n  "bars": []\n}');
    draft.getState().edit({ manifest: '{"permissions":["sheet:images"],"bars":[]}' });
    expect(isTemplateDraftDirty(draft.getState())).toBe(true);
  });

  it('a valid manifest is saved whole with the code', async () => {
    const { api, draft } = await readTormenta();
    draft.getState().edit({ manifest: '{"permissions":["sheet:images"]}' });
    await draft.getState().save();
    expect(api.updates.at(-1)?.input).toMatchObject({
      expectedVersion: 3,
      files: tormentaFiles(),
      manifest: { permissions: ['sheet:images'], bars: [] },
    });
    expect(draft.getState().phase).toBe('saved');
  });

  it.each(['{ permissions: ', '{"permissions":["network"]}'])(
    'a manifest the contract refuses (%s) is never sent',
    async (manifest) => {
      const { api, draft } = await readTormenta();
      draft.getState().edit({
        manifest,
        files: withContent(tormentaFiles(), 'index.html', '<p>meu</p>'),
      });
      await draft.getState().save();
      expect(api.updates).toEqual([]);
      expect(draft.getState().phase).toBe('idle');
    },
  );

  it('saving another order of the same files sends that order and counts as a change', async () => {
    const { api, draft } = await readTormenta();
    const reordered = [...tormentaFiles()].reverse();
    draft.getState().edit({ files: reordered });
    expect(isTemplateDraftDirty(draft.getState())).toBe(true);
    await draft.getState().save();
    expect(api.updates.at(-1)?.input.files?.map(({ path }) => path)).toEqual([
      'script.js',
      'style.css',
      'index.html',
    ]);
  });

  it('a blank name is no change', async () => {
    const { draft } = await readTormenta();
    draft.getState().edit({ name: '  ' });
    expect(isTemplateDraftDirty(draft.getState())).toBe(false);
  });
});
