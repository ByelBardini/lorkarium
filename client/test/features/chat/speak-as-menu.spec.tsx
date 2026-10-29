import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import {
  BIA_ACCOUNT,
  openVharnChat,
  receiveBoard,
  receiveChat,
  renderChatPanel,
  vharnChat,
  vharnTable,
} from '../../support/chat-panel-harness';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  duda,
  KAEL_ID,
  kael,
  LYRA_ID,
  lyra,
  VHARN_SCENE,
  vharnBoard,
} from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { TORRE_SCENE, torreBoard } from '../../support/scene-tab-fixtures';

const BIA_ONLINE = { ...BIA_AT_TABLE, online: true };
const TOKEN_IMAGE = '3e2d1c0b-9a8f-47e6-a5d4-c3b2a1908765';
const OTHER_IMAGE = '4e2d1c0b-9a8f-47e6-a5d4-c3b2a1908765';

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function speakAs(): HTMLElement {
  return screen.getByRole('button', { name: /^Falar como/ });
}

async function choose(user: UserEvent, name: string): Promise<void> {
  await user.click(speakAs());
  await user.click(screen.getByRole('menuitemradio', { name }));
}

function menuChoices(): string[] {
  return screen.getAllByRole('menuitemradio').map((item) => item.textContent ?? '');
}

describe('SpeakAsMenu — who one may speak as', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
  });

  it('a player sees "Você" and the tokens they control on the grid', async () => {
    openVharnChat(deps, { account: BIA_ACCOUNT, members: [ANA_AT_TABLE, BIA_ONLINE] });
    receiveBoard(deps, vharnBoard({ tokens: [lyra(), kael({ canControl: false })] }));
    renderChatPanel(deps, 'player');
    await user.click(speakAs());
    expect(menuChoices()).toEqual([
      expect.stringContaining('Você'),
      expect.stringContaining('Lyra'),
    ]);
  });

  it('the master sees every token of the grid', async () => {
    openVharnChat(deps);
    receiveBoard(deps, vharnBoard({ tokens: [lyra(), kael()] }));
    renderChatPanel(deps);
    await user.click(speakAs());
    expect(menuChoices()).toEqual([
      expect.stringContaining('Você'),
      expect.stringContaining('Lyra'),
      expect.stringContaining('Kael'),
    ]);
  });

  // Regression: background art and objects appeared as characters (2026-10-28).
  it.each(['background', 'objects'] as const)(
    'a controlled %s item is absent from Falar como',
    async (layer) => {
      openVharnChat(deps);
      receiveBoard(deps, vharnBoard({ tokens: [lyra(), kael({ layer })] }));
      renderChatPanel(deps);
      await user.click(speakAs());
      expect(screen.queryByRole('menuitemradio', { name: 'Kael' })).toBeNull();
      expect(screen.getByRole('menuitemradio', { name: 'Lyra' })).toBeInTheDocument();
    },
  );

  // Regression: copies of the same named creature repeated its voice in the menu (2026-10-28).
  it('tokens with the same name offer one voice and send as its first controlled token', async () => {
    openVharnChat(deps);
    receiveBoard(deps, vharnBoard({ tokens: [lyra(), kael({ name: 'Lyra' })] }));
    renderChatPanel(deps);
    await user.click(speakAs());
    const voices = screen.getAllByRole('menuitemradio', { name: 'Lyra' });
    expect(voices).toHaveLength(1);
    await user.click(screen.getByRole('menuitemradio', { name: 'Lyra' }));
    await user.type(field(), 'Pela luz!{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({
      kind: 'token',
      sceneId: VHARN_SCENE.id,
      tokenId: LYRA_ID,
    });
  });

  it('a spectator has no "Falar como"', () => {
    openVharnChat(deps, { members: [ANA_AT_TABLE, duda()] });
    receiveBoard(deps, vharnBoard({ tokens: [lyra()] }));
    renderChatPanel(deps, 'spectator');
    expect(screen.queryByRole('button', { name: /^Falar como/ })).toBeNull();
  });

  it('a character menu entry shows the token picture in its own frame', async () => {
    openVharnChat(deps);
    receiveBoard(
      deps,
      vharnBoard({ tokens: [lyra({ imageAssetId: TOKEN_IMAGE, frame: 'round' })] }),
    );
    renderChatPanel(deps);
    await user.click(speakAs());
    const picture = screen.getByRole('menuitemradio', { name: 'Lyra' }).querySelector('img');
    expect(picture).toHaveAttribute('src', `/api/assets/${TOKEN_IMAGE}`);
    expect(picture).toHaveClass('rounded-full');
    await user.click(screen.getByRole('menuitemradio', { name: 'Lyra' }));
    expect(speakAs().querySelector('img')).toHaveAttribute('src', `/api/assets/${TOKEN_IMAGE}`);
  });
});

describe('SpeakAsMenu — speaking as a token', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
    receiveBoard(deps, vharnBoard({ tokens: [lyra(), kael()] }));
    renderChatPanel(deps);
  });

  it('the line goes out as the token of the grid shown', async () => {
    await choose(user, 'Kael');
    expect(speakAs()).toHaveAccessibleName('Falar como: Kael');
    await user.type(field(), 'Alto lá!{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({
      kind: 'token',
      sceneId: VHARN_SCENE.id,
      tokenId: KAEL_ID,
    });
  });

  it('a whisper is always oneself: "Falar como" is disabled while whispering', async () => {
    await choose(user, 'Kael');
    await user.click(screen.getByRole('button', { name: /Pra quem/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Sussurrar pra Caio' }));
    expect(speakAs()).toBeDisabled();
    await user.type(field(), 'psiu{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({ kind: 'self' });
  });

  // Regression: the Table's token voice leaked into private conversations (2026-10-28).
  it('a direct after speaking as a token sends as oneself', async () => {
    await choose(user, 'Kael');
    act(() => {
      vharnChat(deps)
        .getState()
        .startConversation({ kind: 'direct', userId: CAIO_AT_TABLE.userId });
    });
    await user.click(screen.getByRole('button', { name: 'Caio' }));
    await user.type(field(), 'Em particular.{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({ kind: 'self' });
  });

  it('a token whose control was taken away puts "Você" back', async () => {
    await choose(user, 'Lyra');
    receiveBoard(deps, vharnBoard({ version: 5, tokens: [lyra({ canControl: false }), kael()] }));
    expect(speakAs()).toHaveAccessibleName('Falar como: Você');
  });

  it('a token gone from the grid puts "Você" back', async () => {
    await choose(user, 'Lyra');
    receiveBoard(deps, vharnBoard({ version: 5, tokens: [kael()] }));
    expect(speakAs()).toHaveAccessibleName('Falar como: Você');
    await user.type(field(), 'Oi.{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({ kind: 'self' });
  });

  // Regression: a chosen character moved to objects remained a chat voice (2026-10-28).
  it('moving the chosen token out of the token layer puts Você back', async () => {
    await choose(user, 'Lyra');
    receiveBoard(deps, vharnBoard({ version: 5, tokens: [lyra({ layer: 'objects' }), kael()] }));
    expect(speakAs()).toHaveAccessibleName('Falar como: Você');
    await user.type(field(), 'Oi.{Enter}');
    expect(deps.chat.sent.at(-1)?.request.speaker).toEqual({ kind: 'self' });
  });

  it('the server saying the token is gone puts "Você" back and says so', async () => {
    deps.chat.answer = { ok: false, failure: { kind: 'speaker_not_found' } };
    await choose(user, 'Lyra');
    await user.type(field(), 'Ainda aqui?{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Esse personagem não está mais no grid.');
    expect(speakAs()).toHaveAccessibleName('Falar como: Você');
    expect(field()).toHaveValue('Ainda aqui?');
  });

  it('a FORBIDDEN refusal becomes a message and keeps the draft', async () => {
    deps.chat.answer = { ok: false, failure: { kind: 'forbidden' } };
    await choose(user, 'Lyra');
    await user.type(field(), 'Sou eu.{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não pode falar como esse personagem.',
    );
    expect(field()).toHaveValue('Sou eu.');
  });
});

describe('ChatMessageRow — a character speaking', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharnChat(deps, { members: [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE] });
    renderChatPanel(deps);
  });

  function tokenLine(overrides: Parameters<typeof chatSent>[0]) {
    return chatSent({
      speaker: { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: LYRA_ID, name: 'Lyra' },
      text: 'Pela luz!',
      ...overrides,
    });
  }

  it('a player’s character shows by its name in the display italic, with who plays it', () => {
    receiveChat(deps, tokenLine({}));
    const row = within(screen.getByRole('log')).getByText('Pela luz!').closest('li');
    if (!row) throw new Error('the line of Lyra is not in the feed');
    const name = within(row).getByText('Lyra');
    expect(name).toHaveClass('font-display', 'italic');
    expect(within(row).getByText('Pela luz!')).toHaveClass('font-display', 'italic');
    expect(within(row).getByText('Bia')).toBeInTheDocument();
  });

  it('the master’s character reads "NPC · " and the master', () => {
    receiveChat(
      deps,
      tokenLine({
        messageId: chatMessageIdOf(3),
        fromUserId: ANA.id,
        speaker: { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: KAEL_ID, name: 'Ogro' },
      }),
    );
    const row = within(screen.getByRole('log')).getByText('Pela luz!').closest('li');
    expect(row).toHaveTextContent('NPC · Ana');
  });

  it('a line as oneself is in the body font', () => {
    receiveChat(deps, chatSent({ text: 'Fora do jogo.' }));
    expect(within(screen.getByRole('log')).getByText('Fora do jogo.')).not.toHaveClass(
      'font-display',
    );
  });

  it('a character message uses its token id picture, even when another token has the same name', () => {
    receiveBoard(
      deps,
      vharnBoard({
        tokens: [
          lyra({ imageAssetId: TOKEN_IMAGE }),
          kael({ name: 'Lyra', imageAssetId: OTHER_IMAGE }),
        ],
      }),
    );
    receiveChat(
      deps,
      tokenLine({
        speaker: { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: KAEL_ID, name: 'Lyra' },
      }),
    );
    expect(screen.getByRole('log').querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${OTHER_IMAGE}`,
    );
  });

  it('a message from another open grid resolves its picture by both scene and token id', () => {
    receiveBoard(deps, vharnBoard({ tokens: [lyra({ imageAssetId: TOKEN_IMAGE })] }));
    receiveChat(
      deps,
      tokenLine({
        speaker: { kind: 'token', sceneId: TORRE_SCENE.id, tokenId: LYRA_ID, name: 'Lyra' },
      }),
    );
    expect(screen.getByRole('log').querySelector('img')).toBeNull();
    act(() => vharnTable(deps).tabs.getState().open(TORRE_SCENE.id));
    deps.tableSessionApi.emitToGrid(TORRE_SCENE.id, {
      kind: 'board',
      state: torreBoard({ tokens: [lyra({ imageAssetId: OTHER_IMAGE })] }),
    });
    expect(screen.getByRole('log').querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${OTHER_IMAGE}`,
    );
    act(() => vharnTable(deps).tabs.getState().close(TORRE_SCENE.id));
    expect(screen.getByRole('log').querySelector('img')).toBeNull();
  });

  it('a token removed after the message falls back to its initials instead of another same-named token', () => {
    receiveBoard(
      deps,
      vharnBoard({
        tokens: [
          lyra({ imageAssetId: TOKEN_IMAGE }),
          kael({ name: 'Lyra', imageAssetId: OTHER_IMAGE }),
        ],
      }),
    );
    receiveChat(deps, tokenLine({}));
    expect(screen.getByRole('log').querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${TOKEN_IMAGE}`,
    );
    receiveBoard(
      deps,
      vharnBoard({ version: 5, tokens: [kael({ name: 'Lyra', imageAssetId: OTHER_IMAGE })] }),
    );
    expect(screen.getByRole('log').querySelector('img')).toBeNull();
    expect(within(screen.getByRole('log')).getByText('LY')).toBeInTheDocument();
  });

  it('a broken character picture falls back to the token initials', () => {
    receiveBoard(deps, vharnBoard({ tokens: [lyra({ imageAssetId: TOKEN_IMAGE })] }));
    receiveChat(deps, tokenLine({}));
    const picture = screen.getByRole('log').querySelector('img');
    expect(picture).not.toBeNull();
    if (picture) fireEvent.error(picture);
    expect(screen.getByRole('log').querySelector('img')).toBeNull();
    expect(within(screen.getByRole('log')).getByText('LY')).toBeInTheDocument();
  });
});
