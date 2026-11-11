import { act, render } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useSpeakAsVoice } from '@/features/chat/use-speak-as-voice';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createChatHistoryStore, type ChatHistoryStore } from '@/stores/chat-history-store';
import { VHARN } from '../../support/campaigns-api-fake';
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
}>;

// Writes down which voice the composer would send with, at each render.
function VoiceProbe({ board, chat, spoken }: VoiceProbeProps): null {
  const { speaker } = useSpeakAsVoice(board, chat, 'player');
  spoken.push(speaker.kind === 'token' ? speaker.tokenId : 'self');
  return null;
}

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
    chat.getState().setSpeakAsTokenId(LYRA_ID);
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
