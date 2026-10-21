import { cell } from '@lorkarium/game-core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenDialog } from '@/features/tokens/token-dialog';
import type { TokenDto } from '@lorkarium/contracts';
import { VHARN } from '../../support/campaigns-api-fake';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE, LYRA_ID, lyra } from '../../support/table-session-fixtures';

const PLAYERS = [BIA_AT_TABLE, CAIO_AT_TABLE].map(({ userId, name }) => ({ userId, name }));

let commands: TableBoardCommandsFake;
let closed: number;

beforeEach(() => {
  commands = new TableBoardCommandsFake();
  closed = 0;
});

type RenderOptions = Readonly<{ connected?: boolean; players?: typeof PLAYERS }>;

function renderDialog(token: TokenDto | null = null, options: RenderOptions = {}): void {
  render(
    <TokenDialog
      campaignId={VHARN.id}
      token={token}
      placeAt={cell(9, 5)}
      layer="tokens"
      players={options.players ?? PLAYERS}
      commands={commands}
      assets={new AssetsApiFake()}
      distance={{ cellDistance: 1.5, cellUnit: 'm' }}
      connected={options.connected ?? true}
      onClose={() => {
        closed += 1;
      }}
    />,
  );
}

async function openTab(name: RegExp | string): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name }));
}

async function chooseController(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name }));
}

function preview(): HTMLElement {
  return screen.getByRole('region', { name: 'Prévia do token' });
}

describe('TokenDialog, the shell', () => {
  it('opens on "Básico", with the tabs "Básico", "Barras 0" and "Visão e luz"', () => {
    renderDialog();

    expect(screen.getByRole('tab', { name: 'Básico' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Barras 0' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Visão e luz' })).toBeInTheDocument();
  });

  it('going to another tab and back keeps what was typed', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');

    await openTab('Visão e luz');
    await openTab('Básico');

    expect(screen.getByLabelText('Nome')).toHaveValue('Kael');
  });

  it('the preview shows the initials and the name as they are typed', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro das Cinzas');

    expect(within(preview()).getByText('OC')).toBeInTheDocument();
    expect(within(preview()).getByText('Ogro das Cinzas')).toBeInTheDocument();
  });

  it('without a name the preview reads "?" and "Sem nome"', () => {
    renderDialog();

    expect(within(preview()).getByText('?')).toBeInTheDocument();
    expect(within(preview()).getByText('Sem nome')).toBeInTheDocument();
  });

  it('choosing "Inimigo" turns the summary of the preview into "Inimigo · 1 × 1 casa"', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('radio', { name: 'Inimigo' }));

    expect(within(preview()).getByText(/^Inimigo · 1 × 1 casa/)).toBeInTheDocument();
  });

  it('the subtitle of "Novo token" says everyone sees it once created', () => {
    renderDialog();

    expect(
      screen.getByText('Todo mundo na mesa vê o token assim que você criar.'),
    ).toBeInTheDocument();
  });

  it('while saving it reads "Salvando…", busy and disabled', async () => {
    commands.hold();
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    const saving = screen.getByRole('button', { name: 'Salvando…' });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute('aria-busy', 'true');
  });

  it('a refusal goes to an alert and keeps the dialog open', async () => {
    commands.answerWith({ ok: false, failure: 'invalid' });
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confira os campos e tente de novo.',
    );
    expect(closed).toBe(0);
  });

  it('disconnected, "Criar token" is disabled and the dialog says why', () => {
    renderDialog(null, { connected: false });

    expect(screen.getByRole('button', { name: 'Criar token' })).toBeDisabled();
    expect(screen.getByText('Sem conexão. Aguarde reconectar.')).toBeInTheDocument();
  });

  it('"Esc fecha" is told in the footer', () => {
    renderDialog();

    expect(screen.getByText('Esc fecha')).toBeInTheDocument();
  });
});

describe('TokenDialog, the image through the preview', () => {
  const png = (): File => new File([new Uint8Array(4)], 'lyra.png', { type: 'image/png' });

  it('"Escolher imagem" under the preview → a PNG shows it on the preview and "Criar token" sends it', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');

    expect(within(preview()).getByRole('button', { name: 'Escolher imagem' })).toBeInTheDocument();
    await userEvent.upload(within(preview()).getByLabelText('Arquivo de imagem'), png());
    expect(within(preview()).getByRole('img', { name: 'Imagem escolhida' })).toHaveAttribute(
      'src',
      `/api/assets/${LYRA_PORTRAIT.id}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      imageAssetId: LYRA_PORTRAIT.id,
    });
  });

  it('"Remover imagem" brings the initials back', async () => {
    renderDialog(lyra({ imageAssetId: LYRA_PORTRAIT.id }));

    await userEvent.click(within(preview()).getByRole('button', { name: 'Remover imagem' }));

    expect(within(preview()).queryByRole('img', { name: 'Imagem escolhida' })).toBeNull();
    expect(within(preview()).getByText('LY')).toBeInTheDocument();
  });

  it('a PNG dropped on the preview is sent', async () => {
    renderDialog();
    const file = png();

    await act(async () => {
      fireEvent.drop(within(preview()).getByRole('group', { name: 'Imagem do token' }), {
        dataTransfer: { files: [file] },
      });
    });

    expect(within(preview()).getByRole('img', { name: 'Imagem escolhida' })).toBeInTheDocument();
  });

  it('editing a token without touching its image sends the image it has', async () => {
    renderDialog(lyra({ imageAssetId: LYRA_PORTRAIT.id }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({
      tokenId: LYRA_ID,
      imageAssetId: LYRA_PORTRAIT.id,
    });
  });
});

describe('TokenDialog, errors', () => {
  it('an empty name, saved from "Barras", goes back to "Básico" marked with the error', async () => {
    renderDialog();
    await openTab(/^Barras/);

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(screen.getByRole('tab', { name: 'Básico (com erro)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Informe o nome do token.');
    expect(screen.getByText('Falta preencher o que está marcado.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(commands.sent).toEqual([]);
  });

  it('a bar without a label, saved from "Básico", jumps to "Barras"', async () => {
    renderDialog(lyra());
    await openTab(/^Barras/);
    await userEvent.clear(screen.getAllByLabelText(/^Rótulo/)[0]!);
    await openTab('Básico');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('tab', { name: 'Barras 2 (com erro)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Dê um nome à barra.')).toBeInTheDocument();
  });
});

describe('TokenDialog, who controls and the size', () => {
  it("creating with nobody pressed sends no controller: the token is the master's", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({ controllerIds: [] });
  });

  it('"Novo token" offers the size, and "Grande" creates a 2 × 2', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');

    await userEvent.click(screen.getByRole('button', { name: /^Grande/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({ width: 2, height: 2 });
  });

  it('editing Lyra to "Imenso" sends 4 × 4; at the edge the server answers "Fora da cena." and the dialog stays', async () => {
    commands.answerWith({ ok: false, failure: 'out_of_scene' });
    renderDialog(lyra());

    await userEvent.click(screen.getByRole('button', { name: /^Imenso/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ width: 4, height: 4 });
    expect(await screen.findByRole('alert')).toHaveTextContent('Fora da cena.');
    expect(closed).toBe(0);
  });
});

describe('TokenDialog, bars', () => {
  it('the tab reads "Barras 2" for a token with two bars', () => {
    renderDialog(lyra());

    expect(screen.getByRole('tab', { name: 'Barras 2' })).toBeInTheDocument();
  });

  it('creating with "+ PV" and a max of 45 sends the bar full: 45 / 45', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');
    await openTab(/^Barras/);
    await userEvent.click(screen.getByRole('button', { name: '+ PV' }));
    await userEvent.clear(screen.getByLabelText('Máximo de PV'));
    await userEvent.type(screen.getByLabelText('Máximo de PV'), '45');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      bars: [{ label: 'PV', current: 45, max: 45, color: 'ember', visibility: 'controllers' }],
    });
  });

  it('editing Lyra (PV 12 / 38) to a max of 50 keeps the current: 12 / 50', async () => {
    const [pv, inspiration] = lyra().bars;
    renderDialog(lyra({ bars: [{ ...pv!, current: 12, max: 38 }, inspiration!] }));
    await openTab(/^Barras/);
    await userEvent.clear(screen.getByLabelText('Máximo de PV'));
    await userEvent.type(screen.getByLabelText('Máximo de PV'), '50');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({
      bars: [{ label: 'PV', current: 12, max: 50 }, { label: 'Inspiração' }],
    });
  });

  it('a max of "0", saved from "Básico", jumps to "Barras" with "De 1 a 99 999." on the field', async () => {
    renderDialog(lyra());
    await openTab(/^Barras/);
    await userEvent.clear(screen.getByLabelText('Máximo de PV'));
    await userEvent.type(screen.getByLabelText('Máximo de PV'), '0');
    await openTab('Básico');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByLabelText('Máximo de PV')).toHaveAccessibleDescription('De 1 a 99 999.');
    expect(commands.sent).toEqual([]);
  });
});

describe('TokenDialog, create, edit and delete', () => {
  it('"Novo token" fills the initials from the name and creates it at the center of the view', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Novo token' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Ogro das Cinzas');
    expect(within(dialog).getByLabelText('Iniciais')).toHaveValue('OC');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Inimigo' }));
    await chooseController('Bia');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')).toEqual([
      {
        name: 'createToken',
        campaignId: VHARN.id,
        fields: {
          name: 'Ogro das Cinzas',
          initials: 'OC',
          side: 'enemy',
          width: 1,
          height: 1,
          controllerIds: [BIA_AT_TABLE.userId],
          imageAssetId: null,
          sightAngle: 360,
          sight: { bright: 6, dim: 6 },
          bars: [],
          col: 9,
          row: 5,
          layer: 'tokens',
        },
      },
    ]);
    expect(closed).toBe(1);
  });

  it('initials typed by hand are kept when the name changes', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Kael');
    await userEvent.clear(screen.getByLabelText('Iniciais'));
    await userEvent.type(screen.getByLabelText('Iniciais'), 'kx');
    await userEvent.type(screen.getByLabelText('Nome'), ' Rubro');
    expect(screen.getByLabelText('Iniciais')).toHaveValue('KX');
  });

  it('"Editar token" opens filled, says changes reach everyone, and sends token:update', async () => {
    renderDialog(lyra());
    const dialog = screen.getByRole('dialog', { name: 'Editar token' });
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Lyra');
    expect(
      within(dialog).getByText('As mudanças aparecem pra todo mundo assim que você salvar.'),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ tokenId: LYRA_ID, name: 'Lyra' }),
      }),
    ]);
  });

  it('"Excluir token" asks first and then sends token:delete', async () => {
    renderDialog(lyra());
    await userEvent.click(screen.getByRole('button', { name: 'Excluir token' }));
    expect(screen.getByText('Excluir Lyra? Isso não tem volta.')).toBeInTheDocument();
    expect(commands.sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(commands.sentAs('deleteToken')).toEqual([
      { name: 'deleteToken', campaignId: VHARN.id, fields: { tokenId: LYRA_ID } },
    ]);
  });
});

function section(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('TokenDialog, vision and light', () => {
  it('created untouched, the token sees in the dark 6 + 6 cells and gives off no light', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    const fields = commands.sentAs('createToken')[0]?.fields;
    expect(fields).toMatchObject({ sight: { bright: 6, dim: 6 } });
    expect(fields).not.toHaveProperty('light');
  });

  it('the summary of the preview says "vê no escuro", and "com luz" once the light is on', async () => {
    renderDialog();
    expect(within(preview()).getByText('Aliado · 1 × 1 casa · vê no escuro')).toBeInTheDocument();
    await openTab('Visão e luz');

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));

    expect(
      within(preview()).getByText('Aliado · 1 × 1 casa · vê no escuro · com luz'),
    ).toBeInTheDocument();
  });

  it('switching the light on and creating sends the torch: light 4 + 4 cells', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');
    await openTab('Visão e luz');

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      light: { bright: 4, dim: 4 },
    });
  });

  it('seeing until 18 m and dim until 24 m is created with sight 12 + 4 cells', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');
    await openTab('Visão e luz');
    const vision = section('Enxerga no escuro');
    await userEvent.clear(within(vision).getByLabelText('Plena até (m)'));
    await userEvent.type(within(vision).getByLabelText('Plena até (m)'), '18');
    await userEvent.clear(within(vision).getByLabelText('Penumbra até (m)'));
    await userEvent.type(within(vision).getByLabelText('Penumbra até (m)'), '24');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      sight: { bright: 12, dim: 4 },
    });
  });

  it('editing Lyra, who does not see in the dark, opens the switch off and sends no sight', async () => {
    renderDialog(lyra());
    await openTab('Visão e luz');

    expect(screen.getByRole('switch', { name: 'Enxerga no escuro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).not.toHaveProperty('sight');
  });

  it('editing Lyra, who sees 12 + 4 cells, shows "18" and "24"; switching off sends sight null', async () => {
    renderDialog(lyra({ sight: { bright: 12, dim: 4 } }));
    await openTab('Visão e luz');
    const vision = section('Enxerga no escuro');
    expect(within(vision).getByLabelText('Plena até (m)')).toHaveValue('18');
    expect(within(vision).getByLabelText('Penumbra até (m)')).toHaveValue('24');

    await userEvent.click(screen.getByRole('switch', { name: 'Enxerga no escuro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ sight: null });
  });

  it('editing Lyra with a torch shows "6" and "12"; switching it off sends light null', async () => {
    renderDialog(lyra({ light: { bright: 4, dim: 4, color: null, angle: 360 } }));
    await openTab('Visão e luz');
    const light = section('Emite luz');
    expect(within(light).getByLabelText('Plena até (m)')).toHaveValue('6');
    expect(within(light).getByLabelText('Penumbra até (m)')).toHaveValue('12');

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ light: null });
  });

  it('switching the light on, choosing "Lua" and creating sends a moon torch of 4 + 4 cells', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');
    await openTab('Visão e luz');

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Lua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({
      light: { bright: 4, dim: 4, color: 'moon', angle: 360 },
    });
  });

  it('editing Lyra with a fire light shows "Fogo" checked; choosing "Neutra" keeps the reach', async () => {
    renderDialog(lyra({ light: { bright: 4, dim: 4, color: 'fire', angle: 360 } }));
    await openTab('Visão e luz');
    expect(screen.getByRole('radio', { name: 'Fogo' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Neutra' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({
      light: { bright: 4, dim: 4, color: null, angle: 360 },
    });
  });

  it('a token without light saved untouched sends no light at all', async () => {
    renderDialog(lyra());

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).not.toHaveProperty('light');
  });

  it('a penumbra until short of the plena, saved from "Básico", jumps to "Visão e luz" with the message', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');
    await openTab('Visão e luz');
    const vision = section('Enxerga no escuro');
    await userEvent.clear(within(vision).getByLabelText('Penumbra até (m)'));
    await userEvent.type(within(vision).getByLabelText('Penumbra até (m)'), '6');
    await openTab('Básico');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(screen.getByRole('tab', { name: 'Visão e luz (com erro)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(section('Enxerga no escuro')).getByLabelText('Penumbra até (m)'),
    ).toHaveAccessibleDescription('De 9 a 159 m.');
    expect(commands.sentAs('createToken')).toEqual([]);
  });

  it('a light past 150 m is refused on its field and nothing is sent', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Lyra');
    await openTab('Visão e luz');
    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));
    const light = section('Emite luz');
    await userEvent.clear(within(light).getByLabelText('Plena até (m)'));
    await userEvent.type(within(light).getByLabelText('Plena até (m)'), '151');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(
      within(section('Emite luz')).getByLabelText('Plena até (m)'),
    ).toHaveAccessibleDescription('De 0 a 150 m.');
    expect(commands.sentAs('createToken')).toEqual([]);
  });
});

describe('TokenDialog, the field of view and the beam', () => {
  it('created untouched, the token sees every side: sightAngle 360', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Ogro');

    await userEvent.click(screen.getByRole('button', { name: 'Criar token' }));

    expect(commands.sentAs('createToken')[0]?.fields).toMatchObject({ sightAngle: 360 });
  });

  it('editing Lyra to "90" sends token:update with sightAngle 90', async () => {
    renderDialog(lyra());
    await openTab('Visão e luz');
    await userEvent.clear(screen.getByLabelText('Campo de visão (°)'));
    await userEvent.type(screen.getByLabelText('Campo de visão (°)'), '90');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ sightAngle: 90 });
  });

  it('"0" stays in the dialog with the error, back on the vision tab', async () => {
    renderDialog(lyra());
    await openTab('Visão e luz');
    await userEvent.clear(screen.getByLabelText('Campo de visão (°)'));
    await userEvent.type(screen.getByLabelText('Campo de visão (°)'), '0');
    await openTab('Básico');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')).toEqual([]);
    expect(screen.getByLabelText('Campo de visão (°)')).toBeInTheDocument();
    expect(screen.getByText('De 1 a 360°.')).toBeInTheDocument();
  });

  it('a lantern of "60" is sent as light.angle 60', async () => {
    renderDialog(lyra({ light: { bright: 4, dim: 0, color: null, angle: 360 } }));
    await openTab('Visão e luz');
    await userEvent.clear(screen.getByLabelText('Abertura do feixe (°)'));
    await userEvent.type(screen.getByLabelText('Abertura do feixe (°)'), '60');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('updateToken')[0]?.fields).toMatchObject({ light: { angle: 60 } });
  });
});
