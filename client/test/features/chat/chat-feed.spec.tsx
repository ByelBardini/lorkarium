import { act, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatFeed } from '@/features/chat/chat-feed';
import type { ChatPeople } from '@/features/chat/use-chat-people';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { OpenTable } from '@/stores/open-tables-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { RenderCounter } from '../../support/render-counter';
import { openVharnTabs } from '../../support/scene-tabs-harness';
import { SubscriptionCounter } from '../../support/subscription-counter';
import { TableSessionApiFake } from '../../support/table-session-api-fake';
import {
  BIA_AT_TABLE,
  LYRA_ID,
  VHARN_SCENE,
  lyra,
  tokenMovedAt,
  tokenUpdatedAt,
  vharnBoard,
} from '../../support/table-session-fixtures';

const BIA_IDENTITY = { name: 'Bia', color: 'steel', avatarId: null } as const;

// Bia speaks as Lyra and as herself in turns: every other line shows Lyra's face.
const PEOPLE: ChatPeople = {
  viewerId: BIA_AT_TABLE.userId,
  members: [BIA_AT_TABLE],
  identityOf: () => BIA_IDENTITY,
  nameOf: () => 'Bia',
  memberOf: () => BIA_AT_TABLE,
};

const AS_LYRA = { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: LYRA_ID, name: 'Lyra' } as const;

function spokenInTurns(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, n) => {
    const speaker = n % 2 === 0 ? AS_LYRA : ({ kind: 'self' } as const);
    return { event: chatSent({ messageId: chatMessageIdOf(n), speaker }), receivedAtMs: n };
  });
}

describe('ChatFeed of 300 messages, half of them spoken as Lyra', () => {
  let api: TableSessionApiFake;
  let table: OpenTable;
  let listeners: SubscriptionCounter;
  let renders: RenderCounter;

  beforeEach(() => {
    api = new TableSessionApiFake();
    table = openVharnTabs(api);
    act(() => api.emitTo(VHARN.id, { kind: 'board', state: vharnBoard({ tokens: [lyra()] }) }));
    listeners = new SubscriptionCounter(table.board);
    renders = new RenderCounter();
    render(
      <Profiler id="feed" onRender={renders.onRender}>
        <ChatFeed
          name="Mesa"
          messages={spokenInTurns(300)}
          rolls={[]}
          filter="all"
          firstUnreadId={null}
          people={PEOPLE}
          viewerNames={[]}
          diceClock={new InteractionClockFake()}
          tabs={table.tabs}
        />
      </Profiler>,
    );
    renders.count = 0;
  });

  function boardEvent(event: Parameters<typeof tokenUpdatedAt>[1] | null, moved = false): void {
    const at = moved ? tokenMovedAt(5, { col: 9, row: 6 }) : tokenUpdatedAt(5, event ?? lyra());
    act(() => api.emitTo(VHARN.id, { kind: 'boardEvent', event: at }));
  }

  it('reads the faces of the grid through one subscription, not one per line', () => {
    expect(listeners.live).toBe(1);
  });

  it('Lyra moved on the board renders no line of the feed', () => {
    boardEvent(null, true);

    expect(renders.count).toBe(0);
  });

  it('Lyra renamed by initials shows the new initials on her lines', () => {
    boardEvent(lyra({ initials: 'LV' }));

    const log = within(screen.getByRole('log', { name: 'Mensagens: Mesa' }));
    expect(log.getAllByText('LV')).toHaveLength(150);
    expect(renders.count).toBe(1);
  });
});
