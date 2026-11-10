import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapAppearanceDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { DocumentMapAppearances } from '@/features/documents/document-map-appearances';
import type { LibraryMapsResult } from '@/services/library-maps-api';
import { mapWorkspaceKey, type DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { testDependencies } from '../../support/app-dependencies';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { DOCUMENT_ID } from '../../support/documents-fixtures';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  REINO_ID,
  TAVERNA_REGION_ID,
  libraryMapDetail,
} from '../../support/library-map-fixtures';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';

type Appearances = LibraryMapsResult<readonly MapAppearanceDto[]>;

const CAPITAL: MapAppearanceDto = {
  mapId: MUNDO_ID,
  mapName: 'Mundo',
  regionId: CAPITAL_REGION_ID,
  regionName: 'Capital',
  tabName: null,
};
const TAVERNA: MapAppearanceDto = {
  mapId: REINO_ID,
  mapName: 'Reino',
  regionId: TAVERNA_REGION_ID,
  regionName: 'Taverna',
  tabName: null,
};
const CAMPAIGN = detailOf(VHARN);
const LINE_NAME = 'Aparece em';

describe('DocumentMapAppearances', () => {
  let reader: LibraryMapsApiFake;
  let workspace: StoreApi<DocumentWorkspaceStore>;

  beforeEach(() => {
    const deps = testDependencies();
    reader = deps.libraryMapsApi;
    reader.maps.set(MUNDO_ID, libraryMapDetail());
    workspace = deps.documentWorkspace;
  });

  function panel(readVersion: string, documentId = DOCUMENT_ID): React.JSX.Element {
    return (
      <DocumentMapAppearances
        campaign={CAMPAIGN}
        documentId={documentId}
        reader={reader}
        workspace={workspace}
        readVersion={readVersion}
      />
    );
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function renderWith(appearances: Appearances): Promise<ReturnType<typeof render>> {
    reader.answer('appearances', appearances);
    const view = render(panel('0'));
    await settle();
    return view;
  }

  const reads = (): number => reader.calls.filter(({ method }) => method === 'appearances').length;

  it('lists where the document appears, asking about this document', async () => {
    await renderWith({ ok: true, value: [CAPITAL, TAVERNA] });
    expect(reader.calls).toContainEqual({
      method: 'appearances',
      args: [VHARN.id, DOCUMENT_ID],
    });
    expect(screen.getByRole('group', { name: LINE_NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mundo › Capital' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reino › Taverna' })).toBeInTheDocument();
  });

  it('a click opens the map on the region', async () => {
    await renderWith({ ok: true, value: [CAPITAL] });
    await userEvent.click(screen.getByRole('button', { name: 'Mundo › Capital' }));
    const { maps, activeByCampaign } = workspace.getState();
    expect(activeByCampaign[VHARN.id]).toBe(mapWorkspaceKey(VHARN.id));
    expect(maps[0]?.mapName).toBe('Mundo');
    expect(maps[0]?.view.getState()).toMatchObject({
      mapId: MUNDO_ID,
      selectedRegionId: CAPITAL_REGION_ID,
      focusRegionId: CAPITAL_REGION_ID,
    });
  });

  it('with no appearance, the line is gone', async () => {
    await renderWith({ ok: true, value: [] });
    expect(screen.queryByRole('group', { name: LINE_NAME })).not.toBeInTheDocument();
    expect(screen.queryByText(LINE_NAME)).not.toBeInTheDocument();
  });

  it('a failed read shows nothing and does not get in the way', async () => {
    await renderWith({ ok: false, failure: { kind: 'offline' } });
    expect(screen.queryByRole('group', { name: LINE_NAME })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failed read again keeps the list already on screen', async () => {
    const view = await renderWith({ ok: true, value: [CAPITAL] });
    reader.answer('appearances', { ok: false, failure: { kind: 'offline' } });
    view.rerender(panel('1'));
    await settle();
    expect(screen.getByRole('button', { name: 'Mundo › Capital' })).toBeInTheDocument();
  });

  it('reads again when what the reader may see of the maps changes', async () => {
    const view = await renderWith({ ok: true, value: [CAPITAL] });
    reader.answer('appearances', { ok: true, value: [TAVERNA] });
    view.rerender(panel('1'));
    await settle();
    expect(reads()).toBe(2);
    expect(screen.getByRole('button', { name: 'Reino › Taverna' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mundo › Capital' })).not.toBeInTheDocument();
  });

  it('losing every appearance on a new read takes the line away', async () => {
    const view = await renderWith({ ok: true, value: [CAPITAL] });
    reader.answer('appearances', { ok: true, value: [] });
    view.rerender(panel('1'));
    await settle();
    expect(screen.queryByRole('group', { name: LINE_NAME })).not.toBeInTheDocument();
  });

  it('says which tab a place points at', async () => {
    await renderWith({ ok: true, value: [{ ...CAPITAL, tabName: 'Itens' }] });
    expect(screen.getByRole('button', { name: 'Mundo › Capital · aba Itens' })).toBeInTheDocument();
  });

  it('an older answer landing after a newer one is dropped', async () => {
    const held: Array<(result: Appearances) => void> = [];
    reader.heldAppearances = held;
    const view = render(panel('0'));
    view.rerender(panel('1'));
    await act(async () => held[1]?.({ ok: true, value: [TAVERNA] }));
    await act(async () => held[0]?.({ ok: true, value: [CAPITAL] }));
    expect(screen.getByRole('button', { name: 'Reino › Taverna' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mundo › Capital' })).not.toBeInTheDocument();
  });
});
