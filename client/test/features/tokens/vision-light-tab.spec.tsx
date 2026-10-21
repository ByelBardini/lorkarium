import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { VisionLightTab } from '@/features/tokens/vision-light-tab';
import {
  emptyTokenForm,
  tokenFormOf,
  type TokenFormErrors,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';
import { lyra } from '../../support/table-session-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function Harness({
  initial,
  errors = {},
}: Readonly<{ initial?: TokenFormValues; errors?: TokenFormErrors }>) {
  const [form, setForm] = useState(initial ?? emptyTokenForm(METERS));
  return <VisionLightTab form={form} errors={errors} distance={METERS} onChange={setForm} />;
}

function section(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('VisionLightTab, "Enxerga no escuro"', () => {
  it('on a new token is on, with plena until 9 (= 6 casas) and penumbra until 18 (= 12 casas)', () => {
    render(<Harness />);
    const vision = section('Enxerga no escuro');

    expect(within(vision).getByRole('switch', { name: 'Enxerga no escuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(vision).getByLabelText('Plena até (m)')).toHaveValue('9');
    expect(within(vision).getByLabelText('Penumbra até (m)')).toHaveValue('18');
    expect(within(vision).getByText('= 6 casas')).toBeInTheDocument();
    expect(within(vision).getByText('= 12 casas')).toBeInTheDocument();
    expect(
      within(vision).getByText('Na penumbra, vê o mapa, mas não vê tokens.'),
    ).toBeInTheDocument();
  });

  it('switched off, the fields go and it says the token sees only where there is light', async () => {
    render(<Harness />);
    const vision = section('Enxerga no escuro');

    await userEvent.click(within(vision).getByRole('switch', { name: 'Enxerga no escuro' }));

    expect(within(vision).queryByLabelText('Plena até (m)')).not.toBeInTheDocument();
    expect(within(vision).getByText('Sem isso, o token vê só onde há luz.')).toBeInTheDocument();
  });

  it('editing Lyra, who does not see in the dark, opens it off', () => {
    render(<Harness initial={tokenFormOf(lyra(), METERS)} />);

    expect(screen.getByRole('switch', { name: 'Enxerga no escuro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('an error of the plena is on its field', () => {
    render(<Harness errors={{ sight: { bright: 'De 0 a 150 m.' } }} />);

    expect(
      within(section('Enxerga no escuro')).getByLabelText('Plena até (m)'),
    ).toHaveAccessibleDescription('De 0 a 150 m.');
  });
});

describe('VisionLightTab, "Emite luz"', () => {
  it('on a new token is off, with no fields, saying how the torch works', () => {
    render(<Harness />);
    const light = section('Emite luz');

    expect(within(light).getByRole('switch', { name: 'Emite luz' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(light).queryByLabelText('Plena até (m)')).not.toBeInTheDocument();
    expect(
      within(light).getByText(
        'Como uma tocha. Nasce acesa; quem controla apaga pelo menu do token.',
      ),
    ).toBeInTheDocument();
  });

  it('switched on, it shows the torch: plena until 6 and penumbra until 12', async () => {
    render(<Harness />);
    const light = section('Emite luz');

    await userEvent.click(within(light).getByRole('switch', { name: 'Emite luz' }));

    expect(within(light).getByLabelText('Plena até (m)')).toHaveValue('6');
    expect(within(light).getByLabelText('Penumbra até (m)')).toHaveValue('12');
  });
});

describe('VisionLightTab, "Cor da luz"', () => {
  function Recorder({ initial }: Readonly<{ initial: TokenFormValues }>) {
    const [form, setForm] = useState(initial);
    return (
      <>
        <VisionLightTab form={form} errors={{}} distance={METERS} onChange={setForm} />
        <output aria-label="cor">{String(form.lightColor)}</output>
      </>
    );
  }

  it('with "Emite luz" off, there is no "Cor da luz"', () => {
    render(<Harness />);

    expect(screen.queryByRole('radiogroup', { name: 'Cor da luz' })).not.toBeInTheDocument();
  });

  it('switched on, "Cor da luz" comes inside "Emite luz" with "Neutra" checked', async () => {
    render(<Harness />);
    const light = section('Emite luz');

    await userEvent.click(within(light).getByRole('switch', { name: 'Emite luz' }));

    const colors = within(light).getByRole('radiogroup', { name: 'Cor da luz' });
    expect(within(colors).getByRole('radio', { name: 'Neutra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('clicking "Fogo" turns the color of the form to fire', async () => {
    render(
      <Recorder
        initial={tokenFormOf(
          lyra({ light: { bright: 4, dim: 4, color: null, angle: 360 } }),
          METERS,
        )}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Fogo' }));

    expect(screen.getByRole('status', { name: 'cor' })).toHaveTextContent('fire');
  });
});

describe('VisionLightTab, the unit', () => {
  it('says the distances are in the unit of the scene, one cell and the limit', () => {
    render(<Harness />);

    expect(
      screen.getByText('Distâncias na unidade da cena · 1 casa = 1,5 m · até 100 casas'),
    ).toBeInTheDocument();
  });
});

describe('VisionLightTab, the openings', () => {
  it('"Campo de visão (°)" shows with "Enxerga no escuro" off, with its hint', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Enxerga no escuro' }));

    expect(screen.getByLabelText('Campo de visão (°)')).toHaveValue('360');
    expect(
      screen.getByText(
        '360 = vê para todo lado; menos, vê em cone para onde o token olha, e sente o que está a 1 casa em volta.',
      ),
    ).toBeInTheDocument();
  });

  it('"Abertura do feixe (°)" shows only with "Emite luz" on, with its hint', async () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Abertura do feixe (°)')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));

    const light = section('Emite luz');
    expect(within(light).getByLabelText('Abertura do feixe (°)')).toHaveValue('360');
    expect(
      within(light).getByText('360 = ilumina em volta; menos, ilumina em cone, como uma lanterna.'),
    ).toBeInTheDocument();
  });

  it('an error on the field of view shows under it', () => {
    render(<Harness errors={{ sightAngle: 'De 1 a 360°.' }} />);

    expect(screen.getByText('De 1 a 360°.')).toBeInTheDocument();
  });
});
