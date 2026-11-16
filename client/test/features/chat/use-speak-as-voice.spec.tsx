import { act, render } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useSpeakAsVoice } from '@/features/chat/use-speak-as-voice';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createChatHistoryStore, type ChatHistoryStore } from '@/stores/chat-history-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  kaelCharacter,
  LYRA_CHARACTER_ID,
  linkedLyra,
  lyraCharacter,
  syncedCharacters,
} from '../../support/character-fixtures';
import { RenderCounter } from '../../support/render-counter';
import { StorageFake } from '../../support/storage-fake';
import {
  LYRA_ID,
  lyra,
  tokenMovedAt,
  tokenUpdatedAt,
  vharnBoard,
} from '../../support/table-session-fixtures';

type VoiceProbeProps = Readonly<{
  board: StoreApi<BoardStore>;
  chat: StoreApi<ChatHistoryStore>;
  spoken: string[];
  characters?: StoreApi<CharactersStore>;
}>;

const NO_CHARACTERS = createCharactersStore(VHARN.id, () => undefined);

// Writes down which voice the composer would send with, at each render.
function VoiceProbe({ board, chat, spoken, characters }: VoiceProbeProps): null {
  const sources = { board, characters: characters ?? NO_CHARACTERS };
  const { speaker } = useSpeakAsVoice(sources, chat, 'player');
  spoken.push(voiceOf(speaker));
  return null;
}

function voiceOf(speaker: ReturnType<typeof useSpeakAsVoice>['speaker']): string {
  if (speaker.kind === 'token') return speaker.tokenId;
  if (speaker.kind === 'character') return `character:${speaker.characterId}`;
  return 'self';
}

function chatChoosing(voiceId: string): StoreApi<ChatHistoryStore> {
  const chat = createChatHistoryStore({
    campaignId: VHARN.id,
    storage: new StorageFake(),
    viewer: () => null,
  });
  chat.getState().setSpeakAsId(voiceId);
  return chat;
}

describe('useSpeakAsVoice — characters', () => {
  it('speaks as the chosen character even with no grid shown', () => {
    const spoken: string[] = [];
    const characters = syncedCharacters(lyraCharacter());
    const board = createBoardStore(VHARN.id, () => undefined);
    const chat = chatChoosing(LYRA_CHARACTER_ID);

    render(<VoiceProbe board={board} chat={chat} spoken={spoken} characters={characters} />);

    expect(spoken.at(-1)).toBe(`character:${LYRA_CHARACTER_ID}`);
  });

  it('a linked token chosen by its id speaks as its character', () => {
    const spoken: string[] = [];
    const characters = syncedCharacters(lyraCharacter());
    const board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [linkedLyra()] }) });

    render(
      <VoiceProbe
        board={board}
        chat={chatChoosing(LYRA_ID)}
        spoken={spoken}
        characters={characters}
      />,
    );

    expect(spoken.at(-1)).toBe(`character:${LYRA_CHARACTER_ID}`);
  });

  it('a character the viewer does not control goes back to oneself', () => {
    const spoken: string[] = [];
    const characters = syncedCharacters(kaelCharacter({ canControl: false }));
    const board = createBoardStore(VHARN.id, () => undefined);
    const chat = chatChoosing(kaelCharacter().id);

    render(<VoiceProbe board={board} chat={chat} spoken={spoken} characters={characters} />);

    expect(spoken.at(-1)).toBe('self');
  });
});

describe('useSpeakAsVoice', () => {
  let board: StoreApi<BoardStore>;
  let renders: RenderCounter;
  let spoken: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()] }) });
    const chat = createChatHistoryStore({
      campaignId: VHARN.id,
      storage: new StorageFake(),
      viewer: () => null,
    });
    chat.getState().setSpeakAsId(LYRA_ID);
    renders = new RenderCounter();
    spoken = [];
    render(
      <Profiler id="voz" onRender={renders.onRender}>
        <VoiceProbe board={board} chat={chat} spoken={spoken} />
      </Profiler>,
    );
    renders.count = 0;
  });

  function applied(event: Parameters<BoardStore['apply']>[0]): void {
    act(() => board.getState().apply(event));
  }

  it('speaks as Lyra, chosen and controlled', () => {
    expect(spoken).toEqual([LYRA_ID]);
  });

  it('Lyra moved on the board renders nothing', () => {
    applied({ kind: 'boardEvent', event: tokenMovedAt(5, { col: 9, row: 6 }) });

    expect(renders.count).toBe(0);
  });

  it('Lyra renamed renders once', () => {
    applied({ kind: 'boardEvent', event: tokenUpdatedAt(5, lyra({ name: 'Lyra, a Velha' })) });

    expect(renders.count).toBe(1);
  });

  it('Lyra no longer controlled goes back to oneself', () => {
    applied({ kind: 'boardEvent', event: tokenUpdatedAt(5, lyra({ canControl: false })) });

    expect(spoken.at(-1)).toBe('self');
  });
});
