import type { ChatSentDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSpeechBalloons, type SpeechBalloonsDeps } from '@/features/chat/use-speech-balloons';
import { SPEECH_BALLOON_MS } from '@/renderer/speech-balloon';
import { ANA } from '../../support/auth-api-fake';
import { BoardRendererFake } from '../../support/board-renderer-fake';
import { chatMessageIdOf, chatSent, directBetween, trioGroup } from '../../support/chat-fixtures';
import { openVharnChat, receiveChat, vharnChat } from '../../support/chat-panel-harness';
import { BIA_AT_TABLE, KAEL_ID, LYRA_ID, VHARN_SCENE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const TORRE_ID = '7c6b5a49-3827-4615-9403-f2e1d0c9b8a7';

function lyraSays(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({
    messageId: chatMessageIdOf(n),
    speaker: { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: LYRA_ID, name: 'Lyra' },
    text,
    ...overrides,
  });
}

describe('useSpeechBalloons', () => {
  let deps: TestDependencies;
  let renderer: BoardRendererFake;

  beforeEach(() => {
    deps = testDependencies();
    openVharnChat(deps);
    renderer = new BoardRendererFake(() => undefined, 'resolve');
  });

  function mount(overrides: Partial<SpeechBalloonsDeps> = {}) {
    const initial: SpeechBalloonsDeps = {
      renderer,
      chat: vharnChat(deps),
      sceneIdOf: () => VHARN_SCENE.id,
      now: deps.diceClock.now,
      ...overrides,
    };
    return renderHook((props: SpeechBalloonsDeps) => useSpeechBalloons(props), {
      initialProps: initial,
    });
  }

  it('a line of a character at the Table goes to the board as a balloon over its token', () => {
    mount();
    act(() => deps.diceClock.advance(1000));
    receiveChat(deps, lyraSays(1, 'Pela luz!'));
    expect(renderer.speeches).toEqual([
      {
        sceneId: VHARN_SCENE.id,
        balloons: [
          {
            id: chatMessageIdOf(1),
            sceneId: VHARN_SCENE.id,
            tokenId: LYRA_ID,
            speakerName: 'Lyra',
            text: 'Pela luz!',
            shownAt: 1000,
          },
        ],
      },
    ]);
  });

  it.each([
    ['as oneself', chatSent({ messageId: chatMessageIdOf(2) })],
    ['a whisper', lyraSays(3, 'psiu', { channel: { kind: 'table', whisperTo: ANA.id } })],
    ['a direct', lyraSays(4, 'só nós', { channel: directBetween(ANA.id, BIA_AT_TABLE.userId) })],
    ['a group', lyraSays(5, 'plano', { channel: trioGroup() })],
  ])('a line %s gives no balloon', (_case, event) => {
    mount();
    receiveChat(deps, event);
    expect(renderer.speeches).toEqual([]);
  });

  it('each line hands the whole list over, and one past its time leaves it', () => {
    mount();
    receiveChat(deps, lyraSays(1, 'Um.'));
    act(() => deps.diceClock.advance(1000));
    receiveChat(
      deps,
      lyraSays(2, 'Dois.', {
        speaker: { kind: 'token', sceneId: TORRE_ID, tokenId: KAEL_ID, name: 'Kael' },
      }),
    );
    expect(renderer.speeches.at(-1)?.balloons.map((each) => each.text)).toEqual(['Um.', 'Dois.']);
    act(() => deps.diceClock.advance(SPEECH_BALLOON_MS - 500));
    receiveChat(deps, lyraSays(3, 'Três.'));
    expect(renderer.speeches.at(-1)?.balloons.map((each) => each.text)).toEqual(['Dois.', 'Três.']);
  });

  it('the grid shown is the one each call names', () => {
    let shown = VHARN_SCENE.id;
    mount({ sceneIdOf: () => shown });
    shown = TORRE_ID;
    receiveChat(deps, lyraSays(1, 'Aqui.'));
    expect(renderer.speeches.at(-1)?.sceneId).toBe(TORRE_ID);
  });

  it('a new renderer (another grid tab) gets the balloons still alive at once', () => {
    const hook = mount();
    receiveChat(deps, lyraSays(1, 'Ainda.'));
    const next = new BoardRendererFake(() => undefined, 'resolve');
    hook.rerender({
      renderer: next,
      chat: vharnChat(deps),
      sceneIdOf: () => VHARN_SCENE.id,
      now: deps.diceClock.now,
    });
    expect(next.speeches.at(-1)?.balloons.map((each) => each.text)).toEqual(['Ainda.']);
  });

  it('without a renderer nothing is drawn, and the line is kept for when one comes', () => {
    const hook = mount({ renderer: null });
    receiveChat(deps, lyraSays(1, 'Cedo.'));
    hook.rerender({
      renderer,
      chat: vharnChat(deps),
      sceneIdOf: () => VHARN_SCENE.id,
      now: deps.diceClock.now,
    });
    expect(renderer.speeches.at(-1)?.balloons.map((each) => each.text)).toEqual(['Cedo.']);
  });
});
