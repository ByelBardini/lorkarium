import type { BoardStateDto, SessionMemberDto } from '@lorkarium/contracts';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BIA_ONLINE, PlayerCardHarness, cardBar } from '../../support/player-card-harness';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  LYRA_ID,
  VHARN_SCENE,
  lyra,
  memberCard,
} from '../../support/table-session-fixtures';

const IMAGE_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';
const LYRA_BARS = [cardBar(), cardBar({ position: 1, label: 'Mana', current: 9, max: 16 })];

describe('PlayerCard', () => {
  let harness: PlayerCardHarness;

  beforeEach(() => {
    harness = new PlayerCardHarness();
  });

  function renderCard(
    state: Partial<BoardStateDto> = {},
    member: SessionMemberDto = BIA_ONLINE,
    viewerId = BIA_AT_TABLE.userId,
  ): void {
    harness.render({ state: { tokens: [lyra({ bars: LYRA_BARS })], ...state }, member, viewerId });
  }

  const card = () => screen.getByRole('article');

  it('shows the portrait, the character, the nick with "você", the bars, CA and the note of Bia', () => {
    const notes = memberCard({ armorClass: 15, noteOne: 'Percepção passiva 14' });
    renderCard({
      tokens: [lyra({ bars: LYRA_BARS, imageAssetId: IMAGE_ID })],
      memberCards: [notes],
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

  it('a nickname on the card names the character instead of the token', () => {
    renderCard({ memberCards: [memberCard({ characterName: 'Lyra Vandel' })] });

    expect(screen.getByRole('heading', { level: 3, name: 'Lyra Vandel' })).toBeInTheDocument();
  });

  it('a token without an image shows its initials in the portrait', () => {
    renderCard();

    expect(within(screen.getByTestId('portrait')).getByText('LY')).toBeInTheDocument();
  });

  it('a bar only its controllers see carries the lock for whoever receives it', () => {
    renderCard({ tokens: [lyra({ bars: [cardBar({ visibility: 'controllers' })] })] });

    expect(screen.getByRole('img', { name: 'Só quem controla vê' })).toBeInTheDocument();
  });

  it('a token without bars says so', () => {
    renderCard({ tokens: [lyra({ bars: [] })] });

    expect(card()).toHaveTextContent('Token sem barras');
  });

  it('a player without a main token: initials of the account, no bars and no "Achar no mapa"', () => {
    renderCard({ tokens: [] });

    expect(screen.getByRole('heading', { level: 3, name: 'Sem personagem' })).toBeInTheDocument();
    expect(within(screen.getByTestId('portrait')).getByText('BI')).toBeInTheDocument();
    expect(card()).toHaveTextContent('Sem token principal nesta cena.');
    expect(screen.queryByRole('button', { name: /no mapa/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'CA de Bia' })).toBeInTheDocument();
  });

  it('Caio offline reads offline in the symbol and in the nick line', () => {
    const caioLyra = lyra({ controllerIds: [CAIO_AT_TABLE.userId] });
    renderCard({ tokens: [caioLyra] }, { ...CAIO_AT_TABLE, online: false });

    expect(screen.getByRole('img', { name: 'offline' })).toBeInTheDocument();
    expect(screen.getByTestId('nick-line')).toHaveTextContent('Caio· offline');
  });

  it('"Achar Lyra no mapa" selects Lyra on the board', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Achar Lyra no mapa' }));

    expect(harness.interaction.getState().selectedTokenIds).toEqual([LYRA_ID]);
  });

  it('a token in the dark for the viewer shows the whole card, without "Achar no mapa"', () => {
    const unseen = lyra({
      bars: LYRA_BARS,
      canControl: false,
      controllerIds: [BIA_AT_TABLE.userId],
    });
    const caio = CAIO_AT_TABLE.userId;
    renderCard({ scene: { ...VHARN_SCENE, vision: 'dark' }, tokens: [unseen] }, BIA_ONLINE, caio);

    expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Achar Lyra no mapa' })).toBeNull();
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
