import type { BoardStateDto, CharacterDto, SessionMemberDto } from '@lorkarium/contracts';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { linkedLyra } from '../../support/character-fixtures';
import { BIA_ONLINE, PlayerCardHarness, cardBar } from '../../support/player-card-harness';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  LYRA_ID,
  VHARN_SCENE,
} from '../../support/table-session-fixtures';

const IMAGE_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';
const LYRA_BARS = [cardBar(), cardBar({ position: 1, label: 'Mana', current: 9, max: 16 })];

describe('PlayerCard', () => {
  let harness: PlayerCardHarness;

  beforeEach(() => {
    harness = new PlayerCardHarness();
  });

  type CardOptions = Readonly<{
    character?: Partial<CharacterDto> | null;
    state?: Partial<BoardStateDto>;
    member?: SessionMemberDto;
    viewerId?: string;
  }>;

  function renderCard({ character = {}, ...rest }: CardOptions = {}): void {
    harness.render({ character: character && { bars: LYRA_BARS, ...character }, ...rest });
  }

  const card = () => screen.getByRole('article');

  it('shows Lyra\'s portrait, her name, the nick with "você", her bars, CA and note', () => {
    renderCard({
      character: { imageAssetId: IMAGE_ID, armorClass: 15, noteOne: 'Percepção passiva 14' },
    });

    expect(screen.getByRole('img', { name: 'Retrato de Lyra' })).toHaveAttribute(
      'src',
      expect.stringContaining(IMAGE_ID),
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Lyra' })).toBeInTheDocument();
    expect(screen.getByTestId('nick-line')).toHaveTextContent('Bia· você');
    expect(screen.getByRole('img', { name: 'online' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toHaveTextContent('21 / 28');
    expect(screen.getByRole('meter', { name: 'Mana de Lyra' })).toHaveTextContent('9 / 16');
    expect(screen.getByRole('textbox', { name: 'CA de Lyra' })).toHaveValue('15');
    expect(screen.getByRole('textbox', { name: 'Anotação 1 de Lyra' })).toHaveValue(
      'Percepção passiva 14',
    );
  });

  it('the presence rides on the corner of the portrait, not before the nick', () => {
    renderCard();

    const mark = screen.getByRole('img', { name: 'online' });
    expect(within(screen.getByTestId('portrait')).getByRole('img', { name: 'online' })).toBe(mark);
    expect(within(screen.getByTestId('nick-line')).queryByRole('img')).toBeNull();
  });

  it("the character's name is the heading, whatever its token is called", () => {
    renderCard({
      character: { name: 'Lyra Vandel' },
      state: { tokens: [linkedLyra({ name: 'Lyra' })] },
    });

    expect(screen.getByRole('heading', { level: 3, name: 'Lyra Vandel' })).toBeInTheDocument();
  });

  it('a character without an image shows its initials, tagged "Token" while on the grid', () => {
    renderCard();

    const portrait = screen.getByTestId('portrait');
    expect(within(portrait).getByText('LY')).toBeInTheDocument();
    expect(within(portrait).getByText('Token')).toBeInTheDocument();
  });

  it('a bar only its controllers see carries the lock for whoever receives it', () => {
    renderCard({ character: { bars: [cardBar({ visibility: 'controllers' })] } });

    expect(screen.getByRole('img', { name: 'Só quem controla vê' })).toBeInTheDocument();
  });

  it('a character without bars says so', () => {
    renderCard({ character: { bars: [] } });

    expect(card()).toHaveTextContent('Personagem sem barras');
  });

  it('with no token of Lyra in the group grid: her portrait and bars still, no tag, no "Achar no mapa"', () => {
    renderCard({ state: { tokens: [] } });

    expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toHaveTextContent('21 / 28');
    expect(within(screen.getByTestId('portrait')).queryByText('Token')).toBeNull();
    expect(screen.queryByRole('button', { name: /no mapa/ })).toBeNull();
  });

  it('with the characters still loading, only the nick line with the presence symbol', () => {
    renderCard({ character: null });

    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(
      within(screen.getByTestId('nick-line')).getByRole('img', { name: 'online' }),
    ).toBeVisible();
  });

  it('Caio offline reads offline in the symbol and in the nick line', () => {
    renderCard({ member: { ...CAIO_AT_TABLE, online: false } });

    expect(screen.getByRole('img', { name: 'offline' })).toBeInTheDocument();
    expect(screen.getByTestId('nick-line')).toHaveTextContent('Caio· offline');
  });

  it('"Achar Lyra no mapa" selects her token on the board', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Achar Lyra no mapa' }));

    expect(harness.interaction.getState().selectedTokenIds).toEqual([LYRA_ID]);
  });

  it('a token in the dark for the viewer shows the whole card, without "Achar no mapa"', () => {
    const unseen = linkedLyra({ canControl: false, controllerIds: [BIA_AT_TABLE.userId] });
    const scene = { ...VHARN_SCENE, vision: 'dark' as const };
    renderCard({ state: { scene, tokens: [unseen] }, viewerId: CAIO_AT_TABLE.userId });

    expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Achar Lyra no mapa' })).toBeNull();
  });

  it('Bia edits her bar in its balloon off any grid: character:adjustBar with her character', async () => {
    renderCard({ state: { tokens: [] } });

    await userEvent.dblClick(screen.getByRole('button', { name: 'Editar PV de Lyra' }));
    const current = screen.getByRole('textbox', { name: 'Atual' });
    await userEvent.clear(current);
    await userEvent.type(current, '−7{Enter}');

    const [sent] = harness.commands.sentAs('adjustCharacterBar');
    expect(sent?.fields).toMatchObject({ change: { op: 'add', amount: -7 } });
  });

  it('Caio, who does not control Lyra, has no balloon on her bars', () => {
    renderCard({ viewerId: CAIO_AT_TABLE.userId });
    expect(screen.queryByRole('button', { name: 'Editar PV de Lyra' })).toBeNull();
  });

  it('Ana, a master, gets the balloon on the card of Bia', () => {
    harness.render({ viewerId: ANA_AT_TABLE.userId, isMaster: true });
    expect(screen.getByRole('button', { name: 'Editar PV de Lyra' })).toBeInTheDocument();
  });

  describe('away', () => {
    const BIA_AWAY = { ...BIA_ONLINE, awaySince: '2026-10-22T12:00:00.000Z' };
    const SERVER_AT = '2026-10-22T12:04:00.000Z';

    it('Bia away reads the hollow symbol and "· ausente há 4 min"', () => {
      harness.render({ member: BIA_AWAY, serverAt: SERVER_AT });

      expect(screen.getByRole('img', { name: 'ausente' })).toBeInTheDocument();
      expect(screen.getByTestId('nick-line')).toHaveTextContent('Bia· você· ausente há 4 min');
    });

    it('a minute later on the browser clock it reads "há 5 min"', () => {
      harness.render({ member: BIA_AWAY, serverAt: SERVER_AT });

      act(() => harness.clock.advance(60_000));

      expect(screen.getByTestId('nick-line')).toHaveTextContent('ausente há 5 min');
    });

    it('coming back takes the text away', () => {
      harness.render({ member: BIA_AWAY, serverAt: SERVER_AT });

      harness.confirmMember(BIA_ONLINE, '2026-10-22T12:06:00.000Z');

      expect(screen.getByTestId('nick-line')).not.toHaveTextContent('ausente');
      expect(screen.getByRole('img', { name: 'online' })).toBeInTheDocument();
    });
  });
});
