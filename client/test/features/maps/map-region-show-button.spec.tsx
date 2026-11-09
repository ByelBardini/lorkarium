import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampaignRoleDto } from '@lorkarium/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapRegionShowButton } from '@/features/maps/map-region-show-button';
import type { LibraryMapsResult } from '@/services/library-maps-api';
import { testDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  libraryMapDetail,
  mapRegion,
} from '../../support/library-map-fixtures';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import { renderMapTab } from '../../support/map-tab';

const SHOWN = { ok: true, value: null } as const;
const SHOW_NAME = 'Mostrar a todos';

function showRegionCalls(api: LibraryMapsApiFake): readonly unknown[] {
  return api.calls.filter(({ method }) => method === 'showRegion').map(({ args }) => args);
}

function renderButton(api: LibraryMapsApiFake): void {
  render(
    <MapRegionShowButton
      api={api}
      campaignId={VHARN.id}
      mapId={MUNDO_ID}
      regionId={CAPITAL_REGION_ID}
    />,
  );
}

function button(): HTMLElement {
  return screen.getByRole('button', { name: SHOW_NAME });
}

describe('MapRegionShowButton', () => {
  let api: LibraryMapsApiFake;

  beforeEach(() => {
    api = new LibraryMapsApiFake();
  });

  it('sends the region of the map to the server', async () => {
    api.answer('showRegion', SHOWN);
    renderButton(api);
    await userEvent.click(button());
    expect(showRegionCalls(api)).toEqual([[VHARN.id, MUNDO_ID, CAPITAL_REGION_ID]]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a double click while the answer travels sends it once, and it can be sent again after', async () => {
    const held: Array<(result: LibraryMapsResult<null>) => void> = [];
    api.heldRegionShows = held;
    renderButton(api);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(showRegionCalls(api)).toHaveLength(1);
    expect(button()).toBeDisabled();
    await act(async () => held[0]?.(SHOWN));
    expect(button()).toBeEnabled();
    fireEvent.click(button());
    expect(showRegionCalls(api)).toHaveLength(2);
  });

  it('MAP_REGION_NOT_SHOWABLE tells why', async () => {
    api.answer('showRegion', { ok: false, failure: { kind: 'region_not_showable' } });
    renderButton(api);
    await userEvent.click(button());
    expect(screen.getByRole('alert')).toHaveTextContent('Nem todos na sala podem ver esse lugar.');
  });

  it('the reason goes away with a new try', async () => {
    api.answer('showRegion', { ok: false, failure: { kind: 'region_not_showable' } });
    renderButton(api);
    await userEvent.click(button());
    api.answer('showRegion', SHOWN);
    await userEvent.click(button());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a region deleted meanwhile says so', async () => {
    api.answer('showRegion', { ok: false, failure: { kind: 'not_found' } });
    renderButton(api);
    await userEvent.click(button());
    expect(screen.getByRole('alert')).toHaveTextContent('Esse lugar não existe mais.');
  });
});

describe('the button on the card of a region', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });
  afterEach(() => vi.restoreAllMocks());

  async function cardOpenedBy(myRole: CampaignRoleDto) {
    const deps = testDependencies();
    deps.sessionStore.getState().signedIn(ANA);
    deps.openTables.getState().restore(ANA.id);
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ regions: [mapRegion()] }));
    deps.libraryMapsApi.answer('showRegion', SHOWN);
    deps.documentWorkspace
      .getState()
      .openMap({ campaign: detailOf(VHARN, { myRole }), mapId: MUNDO_ID, mapName: 'Mundo' });
    renderMapTab(deps);
    await screen.findByRole('img', { name: 'Mundo' });
    fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
    return deps;
  }

  it('the master shows the region of the card', async () => {
    const deps = await cardOpenedBy('master');
    await userEvent.click(button());
    expect(showRegionCalls(deps.libraryMapsApi)).toEqual([[VHARN.id, MUNDO_ID, CAPITAL_REGION_ID]]);
  });

  it.each<CampaignRoleDto>(['player', 'spectator'])('a %s has no such button', async (role) => {
    await cardOpenedBy(role);
    expect(screen.getByRole('region', { name: 'Capital' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SHOW_NAME })).not.toBeInTheDocument();
  });
});
