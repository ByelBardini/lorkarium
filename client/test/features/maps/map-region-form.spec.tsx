import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapRegionDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { MapRegionForm } from '@/features/maps/map-region-form';
import { MapRegionShape } from '@/features/maps/map-region-shape';
import type { LibraryMapsFailureKind } from '@/services/library-maps-api';
import { VHARN } from '../../support/campaigns-api-fake';
import { vharnLibrary } from '../../support/library-fixtures';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  REINO_ID,
  forestRegion,
  libraryMapSummary,
  mapRegion,
  pinRegion,
} from '../../support/library-map-fixtures';
import { pickCustomColor } from '../../support/pick-custom-color';

const LIBRARY = vharnLibrary({
  maps: [libraryMapSummary(), libraryMapSummary({ id: REINO_ID, name: 'Reino' })],
});

type FormScene = Readonly<{ region?: MapRegionDto; live?: boolean }>;

function renderForm({ region = mapRegion(), live = true }: FormScene = {}) {
  const api = new LibraryMapsApiFake();
  const onRegionChanged = vi.fn<(region: MapRegionDto) => void>();
  const onRegionRemoved = vi.fn<(regionId: string) => void>();
  function Stage(): React.JSX.Element {
    const [current, setCurrent] = useState(region);
    const confirm = (confirmed: MapRegionDto): void => {
      setCurrent(confirmed);
      onRegionChanged(confirmed);
    };
    return (
      <>
        <MapRegionForm
          api={api}
          campaignId={VHARN.id}
          mapId={MUNDO_ID}
          region={current}
          library={LIBRARY}
          documents={new DocumentsApiFake()}
          live={live}
          onRegionChanged={confirm}
          onRegionRemoved={onRegionRemoved}
        />
        <svg>
          <MapRegionShape
            region={current}
            image={{ width: 100, height: 100 }}
            zoom={1}
            onClick={() => undefined}
          />
        </svg>
        <button type="button" onClick={() => setCurrent(forestRegion())}>
          Outra região
        </button>
        <button type="button" onClick={() => setCurrent(mapRegion({ name: 'Renomeada' }))}>
          Outro mestre renomeia
        </button>
      </>
    );
  }
  render(<Stage />);
  return { api, onRegionChanged, onRegionRemoved, user: userEvent.setup() };
}

function updates(api: LibraryMapsApiFake): ReadonlyArray<readonly unknown[]> {
  return api.calls.filter(({ method }) => method === 'updateRegion').map(({ args }) => args);
}

function updateOf(changes: Readonly<Record<string, unknown>>): readonly unknown[] {
  return [VHARN.id, MUNDO_ID, CAPITAL_REGION_ID, changes];
}

const nameField = (): HTMLElement => screen.getByLabelText('Nome');
const descriptionField = (): HTMLElement => screen.getByLabelText('Descrição');

describe('MapRegionForm: name and description', () => {
  it('sends a new name only on leaving the field, and hands over what the server confirmed', async () => {
    const { api, onRegionChanged, user } = renderForm();
    const confirmed = mapRegion({ name: 'Cidadela' });
    api.answer('updateRegion', { ok: true, value: confirmed });
    await user.clear(nameField());
    await user.type(nameField(), 'Cidadela');
    expect(updates(api)).toEqual([]);
    await user.tab();
    expect(updates(api)).toEqual([updateOf({ name: 'Cidadela' })]);
    await waitFor(() => expect(onRegionChanged).toHaveBeenCalledWith(confirmed));
  });

  it('Enter sends the name too', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion({ name: 'Cidadela' }) });
    await user.clear(nameField());
    await user.type(nameField(), 'Cidadela{Enter}');
    expect(updates(api)).toEqual([updateOf({ name: 'Cidadela' })]);
  });

  it('leaving the field without a change sends nothing', async () => {
    const { api, user } = renderForm();
    await user.click(nameField());
    await user.tab();
    expect(updates(api)).toEqual([]);
  });

  it('sends nothing when only outer spaces changed', async () => {
    const { api, user } = renderForm();
    await user.type(nameField(), '  ');
    await user.tab();
    expect(updates(api)).toEqual([]);
  });

  it('sends a new name without its outer spaces', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion({ name: 'Cidadela' }) });
    await user.clear(nameField());
    await user.type(nameField(), '  Cidadela ');
    await user.tab();
    expect(updates(api)).toEqual([updateOf({ name: 'Cidadela' })]);
  });

  it('a blank name is not sent: it says why and the confirmed name comes back', async () => {
    const { api, user } = renderForm();
    await user.clear(nameField());
    await user.tab();
    expect(updates(api)).toEqual([]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Um lugar precisa de um nome.');
    expect(nameField()).toHaveValue('Capital');
  });

  it('a description of 500 characters is sent whole, and a longer one is cut at the field', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion() });
    await user.clear(descriptionField());
    await user.paste('a'.repeat(501));
    expect(descriptionField()).toHaveValue('a'.repeat(500));
    await user.tab();
    expect(updates(api)).toEqual([updateOf({ description: 'a'.repeat(500) })]);
  });

  it('Enter in the description is a new line and sends nothing', async () => {
    const { api, user } = renderForm();
    await user.type(descriptionField(), '{Enter}Fim');
    expect(updates(api)).toEqual([]);
    expect(descriptionField()).toHaveValue('Onde o rei mora.\nFim');
  });

  it('Esc in the description puts the confirmed text back and sends nothing', async () => {
    const { api, user } = renderForm();
    await user.type(descriptionField(), ' Rascunho{Escape}');
    expect(updates(api)).toEqual([]);
    expect(descriptionField()).toHaveValue('Onde o rei mora.');
  });

  it('follows a name confirmed elsewhere while nobody is typing', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Outro mestre renomeia' }));
    expect(nameField()).toHaveValue('Renomeada');
  });

  it('showing another region drops the message left by the previous one', async () => {
    const { user } = renderForm();
    await user.clear(nameField());
    await user.tab();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Outra região' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Floresta');
  });
});

describe('MapRegionForm: color and hidden', () => {
  it('a color of the palette is sent as its hex', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion({ color: '#8a9bb8' }) });
    await user.click(screen.getByRole('radio', { name: 'Aço' }));
    expect(updates(api)).toEqual([updateOf({ color: '#8a9bb8' })]);
  });

  it('checks the swatch of a region whose hex belongs to the palette', () => {
    renderForm({ region: mapRegion({ color: '#b5654f' }) });
    expect(screen.getByRole('radio', { name: 'Brasa' })).toBeChecked();
  });

  it('a color outside the palette marks the custom tile and no swatch', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Cor personalizada: #aa3300' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ouro' })).not.toBeChecked();
  });

  it('a custom color is sent as picked', async () => {
    const { api } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion({ color: '#336699' }) });
    await pickCustomColor(
      screen.getByRole('button', { name: 'Cor personalizada: #aa3300' }),
      '#336699',
    );
    await waitFor(() => expect(updates(api)).toEqual([updateOf({ color: '#336699' })]));
  });

  it('"Oculta para jogadores" is sent and the confirmed region is drawn dashed for the master', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: true, value: mapRegion({ hidden: true }) });
    await user.click(screen.getByRole('switch', { name: 'Oculta para jogadores' }));
    expect(updates(api)).toEqual([updateOf({ hidden: true })]);
    await waitFor(() => expect(document.querySelector('[data-hidden="true"]')).toBeInTheDocument());
    expect(document.querySelector('[stroke-dasharray]')).toBeInTheDocument();
  });

  it('a refused switch stays as the server last confirmed it', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: false, failure: { kind: 'offline' } });
    await user.click(screen.getByRole('switch', { name: 'Oculta para jogadores' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('switch', { name: 'Oculta para jogadores' })).not.toBeChecked();
  });
});

describe('MapRegionForm: link', () => {
  it('picking an item sends the link', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', {
      ok: true,
      value: mapRegion({ link: { state: 'open', kind: 'map', id: REINO_ID, name: 'Reino' } }),
    });
    await user.click(screen.getByRole('button', { name: 'Mapa: Reino' }));
    expect(updates(api)).toEqual([updateOf({ link: { kind: 'map', id: REINO_ID } })]);
    expect(await screen.findByText('Mapa: Reino')).toBeInTheDocument();
  });

  it('"Remover link" sends a null link', async () => {
    const { api, user } = renderForm({
      region: mapRegion({ link: { state: 'open', kind: 'map', id: REINO_ID, name: 'Reino' } }),
    });
    api.answer('updateRegion', { ok: true, value: mapRegion() });
    await user.click(screen.getByRole('button', { name: 'Remover link' }));
    expect(updates(api)).toEqual([updateOf({ link: null })]);
    expect(await screen.findByText('Sem link')).toBeInTheDocument();
  });
});

describe('MapRegionForm: refusals', () => {
  it.each<[Exclude<LibraryMapsFailureKind, 'plan_limit'>, string]>([
    ['regions_full', 'Esse mapa já chegou a 300 lugares. Exclua um antes de criar outro.'],
    ['link_self', 'Um lugar não pode levar ao mapa em que está.'],
    ['link_target_not_found', 'O item escolhido não existe mais. Escolha outro.'],
    ['map_is_main', 'Esse é o mapa principal da mesa. Escolha outro antes de excluir.'],
    ['region_not_showable', 'Nem todos na sala podem ver esse lugar.'],
    ['not_found', 'Esse lugar não existe mais.'],
    ['offline', 'Sem conexão com o servidor.'],
  ])('a refusal %s shows its own text', async (kind, text) => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: false, failure: { kind } });
    await user.click(screen.getByRole('button', { name: 'Mapa: Reino' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('a save that works clears the previous refusal', async () => {
    const { api, user } = renderForm();
    api.answer('updateRegion', { ok: false, failure: { kind: 'link_target_not_found' } });
    await user.click(screen.getByRole('button', { name: 'Mapa: Reino' }));
    await screen.findByRole('alert');
    api.answer('updateRegion', { ok: true, value: mapRegion() });
    await user.click(screen.getByRole('button', { name: 'Mapa: Reino' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('a second change waits for the answer to the first, so an older answer never lands last', async () => {
    const { api, onRegionChanged, user } = renderForm();
    const held: NonNullable<LibraryMapsApiFake['heldRegionUpdates']> = [];
    api.heldRegionUpdates = held;
    await user.clear(nameField());
    await user.type(nameField(), 'Cidadela');
    await user.click(screen.getByRole('switch', { name: 'Oculta para jogadores' }));
    expect(updates(api)).toEqual([updateOf({ name: 'Cidadela' })]);
    const named = mapRegion({ name: 'Cidadela' });
    await act(async () => held[0]?.({ ok: true, value: named }));
    await waitFor(() => expect(updates(api)).toHaveLength(2));
    expect(updates(api)[1]).toEqual(updateOf({ hidden: true }));
    expect(onRegionChanged).toHaveBeenCalledWith(named);
  });
});

describe('MapRegionForm: deleting', () => {
  async function askToDelete(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: 'Excluir lugar' }));
    return screen.findByRole('alertdialog');
  }

  it('asks first, and "Manter" deletes nothing', async () => {
    const { api, onRegionRemoved, user } = renderForm();
    const dialog = await askToDelete(user);
    expect(dialog).toHaveTextContent('Excluir Capital?');
    expect(api.calls).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Manter' }));
    expect(api.calls).toEqual([]);
    expect(onRegionRemoved).not.toHaveBeenCalled();
  });

  it('confirmed, the region is deleted and the owner of the form is told', async () => {
    const { api, onRegionRemoved, user } = renderForm();
    api.answer('removeRegion', { ok: true, value: null });
    const dialog = await askToDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onRegionRemoved).toHaveBeenCalledWith(CAPITAL_REGION_ID));
    expect(api.calls).toEqual([
      { method: 'removeRegion', args: [VHARN.id, MUNDO_ID, CAPITAL_REGION_ID] },
    ]);
  });

  it('a refused delete stays in the dialog with the reason', async () => {
    const { api, onRegionRemoved, user } = renderForm();
    api.answer('removeRegion', { ok: false, failure: { kind: 'not_found' } });
    const dialog = await askToDelete(user);
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Esse lugar não existe mais.',
    );
    expect(onRegionRemoved).not.toHaveBeenCalled();
  });
});

describe('MapRegionForm: blocked editor', () => {
  it('turns every field and the delete button off without a connection', () => {
    renderForm({ live: false });
    expect(nameField()).toBeDisabled();
    expect(descriptionField()).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Oculta para jogadores' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mapa: Reino' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir lugar' })).toBeDisabled();
  });
});

describe('MapRegionForm, the icon of a pin', () => {
  const PIN = pinRegion({ id: CAPITAL_REGION_ID });

  function iconButton(name: string): HTMLElement {
    return within(screen.getByRole('group', { name: 'Ícone' })).getByRole('button', { name });
  }

  it('a polygon has no icon to choose', () => {
    renderForm();
    expect(screen.queryByRole('group', { name: 'Ícone' })).not.toBeInTheDocument();
  });

  it('marks the icon the pin has', () => {
    renderForm({ region: pinRegion({ id: CAPITAL_REGION_ID, icon: 'castle' }) });
    expect(iconButton('Castelo')).toHaveAttribute('aria-pressed', 'true');
    expect(iconButton('Marcador')).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing another saves it at once', async () => {
    const { api, user } = renderForm({ region: PIN });
    await user.click(iconButton('Castelo'));
    expect(updates(api)).toEqual([updateOf({ icon: 'castle' })]);
  });

  it('choosing the one it has sends nothing', async () => {
    const { api, user } = renderForm({ region: PIN });
    await user.click(iconButton('Marcador'));
    expect(updates(api)).toEqual([]);
  });

  it('turns off without a connection', () => {
    renderForm({ region: PIN, live: false });
    expect(iconButton('Castelo')).toBeDisabled();
  });
});
