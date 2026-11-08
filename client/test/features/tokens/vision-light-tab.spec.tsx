import { act, render, screen, within } from '@testing-library/react';
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
import { RoomContexts } from '@/features/board/room-contexts';
import { createSightOutlineStore } from '@/stores/sight-outline-store';
import { AssetOutlineApiFake } from '../../support/asset-outline-api-fake';
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

  const LIT = { bright: 4, dim: 4, angle: 360 };

  it('#336699 and "Usar cor" turn the color of the form to the hex', async () => {
    render(<Recorder initial={tokenFormOf(lyra({ light: { ...LIT, color: null } }), METERS)} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cor personalizada' }));
    const code = await screen.findByLabelText('Código da cor');
    await userEvent.clear(code);
    await userEvent.type(code, '#336699');
    await userEvent.click(screen.getByRole('button', { name: 'Usar cor' }));

    expect(screen.getByRole('status', { name: 'cor' })).toHaveTextContent('#336699');
  });

  it('a token of #336699 opens marking the custom tile, and "Neutra" clears it', async () => {
    const hexLight = lyra({ light: { ...LIT, color: '#336699' } });
    render(<Recorder initial={tokenFormOf(hexLight, METERS)} />);

    expect(screen.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Neutra' }));

    expect(screen.getByRole('status', { name: 'cor' })).toHaveTextContent('null');
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

describe('VisionLightTab, "Bloqueia a visão"', () => {
  const STATUE_IMAGE = '11112222-3333-4444-8555-666677778888';
  const OLD_IMAGE_NOTICE =
    'Imagem enviada antes deste recurso: bloqueia pelo retângulo. Envie de novo para usar o recorte.';
  const ROUND_NOTICE = 'Com borda redonda, bloqueia pelo disco.';
  const NO_KEYS = { create: false, delete: false };

  type RoomTabOptions = Readonly<{
    api?: AssetOutlineApiFake;
    blocksSight?: boolean;
    imageAssetId?: string | null;
    frame?: 'square' | 'round';
    refusal?: string | null;
  }>;

  function RoomTab({ api, ...options }: RoomTabOptions) {
    const [outlines] = useState(() => createSightOutlineStore(api ?? new AssetOutlineApiFake()));
    const [form, setForm] = useState<TokenFormValues>(() => ({
      ...emptyTokenForm(METERS),
      blocksSight: options.blocksSight ?? false,
      imageAssetId: options.imageAssetId ?? null,
    }));
    return (
      <RoomContexts players={[]} tokenKeys={NO_KEYS} sightOutlines={outlines}>
        <VisionLightTab
          form={form}
          errors={{}}
          distance={METERS}
          frame={options.frame}
          blockerRefusal={options.refusal}
          onChange={setForm}
        />
      </RoomContexts>
    );
  }

  const blockerSwitch = () => screen.getByRole('switch', { name: 'Bloqueia a visão' });

  it('on a new token it is off, and says what it does', () => {
    render(<RoomTab />);

    expect(blockerSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(within(section('Bloqueia a visão')).getByText(/como uma cortina/)).toBeInTheDocument();
  });

  it('editing a token that blocks opens it on', () => {
    render(<Harness initial={tokenFormOf(lyra({ blocksSight: true }), METERS)} />);

    expect(blockerSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('switched on over an image sent before the outline existed, it warns of the rectangle', async () => {
    const api = new AssetOutlineApiFake();
    render(<RoomTab api={api} imageAssetId={STATUE_IMAGE} />);

    await userEvent.click(blockerSwitch());

    expect(api.asked).toEqual([STATUE_IMAGE]);
    expect(await screen.findByText(OLD_IMAGE_NOTICE)).toBeInTheDocument();
  });

  it('the round frame says the disc, whatever the image, and needs no outline', async () => {
    const api = new AssetOutlineApiFake();
    render(<RoomTab api={api} blocksSight frame="round" imageAssetId={STATUE_IMAGE} />);

    await act(() => Promise.resolve());

    expect(screen.getByText(ROUND_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(OLD_IMAGE_NOTICE)).not.toBeInTheDocument();
    expect(api.asked).toEqual([]);
  });

  it('the refusal of the limit shows in the section while the switch is on', () => {
    render(<RoomTab blocksSight refusal="A cena já tem o máximo." />);

    expect(within(section('Bloqueia a visão')).getByRole('alert')).toHaveTextContent(
      'A cena já tem o máximo.',
    );
  });
});
