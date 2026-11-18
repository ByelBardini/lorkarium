import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PLAN_LIMITS } from '@lorkarium/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import { mapRegion } from '../../support/library-map-fixtures';
import { frameTheMapIn1000By600, onTheMap } from '../../support/map-editor-harness';

const MAP_LOCKED =
  'Este mapa interativo passou do limite do plano Grátis (0) e está só leitura: mostrar, Principal e apagar seguem livres. Apague um mapa mais antigo ou suba de plano.';

function onFreeTable(planLocked: boolean) {
  const campaign = detailOf(VHARN, { limits: PLAN_LIMITS.free });
  return onTheMap([mapRegion()], campaign, { planLocked });
}

describe('the map editor of a map past the plan ceiling', () => {
  frameTheMapIn1000By600();
  afterEach(() => vi.restoreAllMocks());

  it('"Editar mapa" is disabled and described by the readOnly sentence', async () => {
    await onFreeTable(true);

    const edit = screen.getByRole('button', { name: 'Editar mapa' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(MAP_LOCKED);
    expect(screen.getByText(MAP_LOCKED)).toBeInTheDocument();
  });

  it('"Editar lugar" on the card is disabled; "Mostrar a todos" stays', async () => {
    await onFreeTable(true);

    fireEvent.click(screen.getByRole('button', { name: 'Capital' }));

    expect(screen.getByRole('button', { name: 'Editar lugar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar lugar' })).toHaveAccessibleDescription(
      MAP_LOCKED,
    );
    expect(screen.getByRole('button', { name: 'Mostrar a todos' })).toBeEnabled();
  });

  it('the map is still explored: a place opens its card', async () => {
    await onFreeTable(true);

    await userEvent.click(screen.getByRole('button', { name: 'Capital' }));

    expect(screen.getByRole('button', { name: 'Mostrar a todos' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Editor do mapa' })).not.toBeInTheDocument();
  });

  it('without planLocked "Editar mapa" opens the editor', async () => {
    await onFreeTable(false);

    await userEvent.click(screen.getByRole('button', { name: 'Editar mapa' }));

    expect(screen.getByRole('toolbar', { name: 'Editor do mapa' })).toBeInTheDocument();
    expect(screen.queryByText(MAP_LOCKED)).not.toBeInTheDocument();
  });
});
