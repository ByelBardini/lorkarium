import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SheetTemplateEditor } from '@/features/sheets/sheet-template-editor';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { replaceCode } from '../../support/code-editor-input';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

let api: SheetTemplatesApiFake;

beforeEach(() => {
  api = new SheetTemplatesApiFake();
});

async function openTormenta({ live = true } = {}) {
  const draft = createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  render(
    <div>
      <SheetTemplateEditor
        draft={draft}
        live={live}
        createChannel={new SheetChannelsFake().create}
      />
      <button type="button">Fora do editor</button>
    </div>,
  );
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
}

// The press as the browser sends it: `false` when something kept the "save page" from opening.
function pressSave(target: Element, keys: Partial<KeyboardEventInit> = { ctrlKey: true }) {
  return fireEvent.keyDown(target, { key: 's', ...keys });
}

function codeField(): HTMLElement {
  return screen.getByRole('textbox', { name: 'HTML do modelo' });
}

describe('Ctrl+S in the template editor', () => {
  it('inside the code field saves, and the browser does not save the page', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    expect(pressSave(codeField())).toBe(false);
    await waitFor(() => expect(api.updates).toHaveLength(1));
    expect(api.updates[0]?.input).toMatchObject({ html: '<p>Força</p>', expectedVersion: 3 });
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
  });

  it('Cmd+S (Mac) in the name field saves too', async () => {
    await openTormenta();
    const name = screen.getByRole('textbox', { name: 'Nome do modelo' });
    fireEvent.change(name, { target: { value: 'Ficha T20' } });
    pressSave(name, { metaKey: true });
    await waitFor(() => expect(api.updates[0]?.input).toMatchObject({ name: 'Ficha T20' }));
  });

  it('with nothing focused and the editor shown, it saves', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    expect(pressSave(document.body)).toBe(false);
    await waitFor(() => expect(api.updates).toHaveLength(1));
  });

  it('nothing changed: no save, and the editor still keeps the key', async () => {
    await openTormenta();
    expect(pressSave(codeField())).toBe(false);
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });

  it('reconnecting: no save', async () => {
    await openTormenta({ live: false });
    replaceCode('HTML do modelo', '<p>Força</p>');
    pressSave(codeField());
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });

  it('past the budget: no save', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', 'x'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES));
    pressSave(codeField());
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });

  it('pressed again while saving, it saves once', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    pressSave(codeField());
    pressSave(codeField());
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(api.updates).toHaveLength(1);
  });

  it('focus outside the editor: the key is left to the page', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    expect(pressSave(screen.getByRole('button', { name: 'Fora do editor' }))).toBe(true);
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });

  it('a hidden editor does not take the key from the page', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    const editor = screen.getByRole('region', { name: 'Editor do modelo' });
    (editor.parentElement as HTMLElement).hidden = true;
    expect(pressSave(document.body)).toBe(true);
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });

  it('Ctrl+Shift+S is not the shortcut', async () => {
    await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    expect(pressSave(codeField(), { ctrlKey: true, shiftKey: true })).toBe(true);
    await Promise.resolve();
    expect(api.updates).toEqual([]);
  });
});
