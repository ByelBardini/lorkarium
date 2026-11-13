import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { documentFixture } from '../../support/documents-fixtures';
import { PORTRAIT, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { treeItem } from '../../support/library-tree';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { tormentaSummary } from '../../support/sheet-template-fixtures';

const LIBRARY_PATH = `/campaigns/${VHARN.id}/table/library`;

describe('opening an item of the tree by a double click or Enter', () => {
  let deps: TestDependencies | null = null;

  afterEach(() => {
    act(() => deps?.documentWorkspace.getState().clear());
    deps = null;
  });

  function withItems(): TestDependencies {
    const created = testDependencies();
    created.documentsApi.document = documentFixture();
    created.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({
        images: [PORTRAIT],
        documents: [created.documentsApi.document],
        sheetTemplates: [tormentaSummary()],
      }),
    });
    deps = created;
    return created;
  }

  it('an image has no tab: a double click shows it in the viewer', async () => {
    await openLibrary(withItems());
    await userEvent.dblClick(treeItem('Retrato'));
    const viewer = await screen.findByRole('dialog', { name: 'Retrato' });
    await userEvent.click(within(viewer).getByRole('button', { name: 'Fechar imagem' }));
    expect(screen.queryByRole('dialog', { name: 'Retrato' })).toBeNull();
  });

  it('Enter on a document opens its room tab, the library staying open', async () => {
    const opened = withItems();
    const { router } = await openLibrary(opened);
    treeItem('Carta').focus();
    await userEvent.keyboard('{Enter}');
    expect(
      opened.documentWorkspace.getState().entries.map(({ document }) => document.name),
    ).toEqual(['Carta']);
    expect(router.state.location.pathname).toBe(LIBRARY_PATH);
  });

  it('a double click on a sheet template opens it in a room tab', async () => {
    const opened = withItems();
    await openLibrary(opened);
    await userEvent.dblClick(treeItem('Ficha Tormenta'));
    expect(
      opened.documentWorkspace.getState().templates.map(({ templateId }) => templateId),
    ).toEqual([TORMENTA_TEMPLATE_ID]);
  });
});
