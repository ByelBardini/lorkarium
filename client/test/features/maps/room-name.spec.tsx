import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { MainMapReaderContext } from '@/features/maps/use-map-home';
import { RoomName } from '@/features/maps/room-name';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';

const CAMPAIGN = detailOf(VHARN);

describe('RoomName', () => {
  let deps: TestDependencies;
  let workspace: StoreApi<DocumentWorkspaceStore>;
  let reader: LibraryMapsApiFake;

  beforeEach(() => {
    deps = testDependencies();
    workspace = deps.documentWorkspace;
    reader = new LibraryMapsApiFake();
  });

  it('with no way to read the main map, it is the plain name', () => {
    render(<RoomName campaign={CAMPAIGN} tabs={null} workspace={workspace} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('while the table is still opening, it is the plain name and reads nothing', () => {
    render(
      <MainMapReaderContext value={reader}>
        <RoomName campaign={CAMPAIGN} tabs={null} workspace={workspace} />
      </MainMapReaderContext>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
    expect(reader.calls).toEqual([]);
  });
});
