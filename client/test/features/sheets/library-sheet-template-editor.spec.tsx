import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { codeTextOf, replaceCode } from '../../support/code-editor-input';
import { masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { treeItem } from '../../support/library-tree';
import { libraryChanged } from '../../support/scene-tab-fixtures';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import {
  contentOf,
  tormentaFiles,
  tormentaSummary,
  tormentaTemplate,
  withContent,
} from '../../support/sheet-template-fixtures';

let current: TestDependencies | null = null;

afterEach(() => {
  act(() => current?.documentWorkspace.getState().clear());
  current = null;
});

function withTormenta(): TestDependencies {
  const deps = testDependencies();
  current = deps;
  deps.libraryApi.answer('list', {
    ok: true,
    value: masterLibrary({ sheetTemplates: [tormentaSummary()] }),
  });
  return deps;
}

async function pickTormenta(): Promise<void> {
  await userEvent.click(treeItem('Ficha Tormenta'));
  const drawer = screen.getByRole('complementary', { name: 'Biblioteca' });
  await within(drawer).findByRole('textbox', { name: 'Arquivo index.html' });
}

describe('the template editor in the library', () => {
  it('"Abrir modelo em janela" opens the window with the unsaved code; the library stays', async () => {
    const deps = withTormenta();
    await openLibrary(deps);
    await pickTormenta();
    replaceCode('Arquivo index.html', '<p>meu</p>');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir modelo em janela' }));
    expect(deps.chatWindowHost.calls[0]).toMatchObject({
      url: '/chat-window.html?panel=sheet-template',
      features: 'popup,width=1100,height=800',
    });
    act(() => deps.chatWindowHost.last().load());
    const body = within(deps.chatWindowHost.last().document.body);
    await body.findByRole('region', { name: 'Editor do modelo' });
    expect(screen.getByRole('tree', { name: 'Itens e pastas' })).toBeInTheDocument();
    expect(deps.documentWorkspace.getState().activeByCampaign[VHARN.id]).toBeNull();
    expect(
      contentOf(
        deps.documentWorkspace.getState().templates[0]?.draft.getState().draft.files ?? [],
        'index.html',
      ),
    ).toBe('<p>meu</p>');
  });

  it('a template open in a tab: the library edits the same text and closing it asks nothing', async () => {
    const deps = withTormenta();
    deps.documentWorkspace.getState().openSheetTemplate({
      campaign: detailOf(VHARN),
      templateId: TORMENTA_TEMPLATE_ID,
      templateName: 'Ficha Tormenta',
    });
    const draft = deps.documentWorkspace.getState().templates[0]!.draft;
    await waitFor(() => expect(draft.getState().load).toBe('ready'));
    draft.getState().edit({ files: withContent(tormentaFiles(), 'index.html', '<p>da aba</p>') });
    await openLibrary(deps);
    await pickTormenta();
    // The tab's editor stays on screen beside the drawer: the library's is the one inside it.
    const drawer = screen.getByRole('complementary', { name: 'Biblioteca' });
    expect(codeTextOf('Arquivo index.html', drawer)).toBe('<p>da aba</p>');
    replaceCode('Arquivo index.html', '<p>da biblioteca</p>', drawer);
    expect(contentOf(draft.getState().draft.files, 'index.html')).toBe('<p>da biblioteca</p>');
    within(drawer).getByRole('treeitem', { name: 'Ficha Tormenta' }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tree')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('another master saving, with nothing unsaved here, shows the new version', async () => {
    const deps = withTormenta();
    await openLibrary(deps);
    await pickTormenta();
    deps.sheetTemplatesApi.templates.set(
      TORMENTA_TEMPLATE_ID,
      tormentaTemplate({
        version: 4,
        files: withContent(tormentaFiles(), 'index.html', '<p>dele</p>'),
      }),
    );
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    await waitFor(() => expect(codeTextOf('Arquivo index.html')).toBe('<p>dele</p>'));
  });
});
