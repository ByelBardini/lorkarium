import { render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserAvatarProps } from '@/components/user-avatar';
import { ChatFeed, type ChatFeedProps } from '@/features/chat/chat-feed';
import type { ChatPeople } from '@/features/chat/use-chat-people';
import type { TokenFaceProps } from '@/features/tokens/token-face';
import type { ChatMessage } from '@/lib/chat-conversations';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { openVharnTabs } from '../../support/scene-tabs-harness';
import { TableSessionApiFake } from '../../support/table-session-api-fake';
import { BIA_AT_TABLE, LYRA_ID, VHARN_SCENE } from '../../support/table-session-fixtures';

// Each line of the feed shows one face (a token's or a person's): counting them counts the lines
// that rendered.
const faces = vi.hoisted(() => ({ rendered: 0 }));
vi.mock('@/features/tokens/token-face', async (original) => {
  const actual = await original<typeof import('@/features/tokens/token-face')>();
  function CountedTokenFace(props: TokenFaceProps): React.JSX.Element {
    faces.rendered += 1;
    return createElement(actual.TokenFace, props);
  }
  return { ...actual, TokenFace: CountedTokenFace };
});
vi.mock('@/components/user-avatar', async (original) => {
  const actual = await original<typeof import('@/components/user-avatar')>();
  function CountedUserAvatar(props: UserAvatarProps): React.JSX.Element {
    faces.rendered += 1;
    return createElement(actual.UserAvatar, props);
  }
  return { ...actual, UserAvatar: CountedUserAvatar };
});

const PEOPLE: ChatPeople = {
  viewerId: BIA_AT_TABLE.userId,
  members: [BIA_AT_TABLE],
  identityOf: () => ({ name: 'Bia', color: 'steel', avatarId: null }),
  nameOf: () => 'Bia',
  memberOf: () => BIA_AT_TABLE,
};
const AS_LYRA = { kind: 'token', sceneId: VHARN_SCENE.id, tokenId: LYRA_ID, name: 'Lyra' } as const;
const VIEWER_NAMES = ['Bia', 'bia'];

// Lyra and Bia in turns: every line has its face.
function spokenInTurns(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, n) => {
    const speaker = n % 2 === 0 ? AS_LYRA : ({ kind: 'self' } as const);
    return { event: chatSent({ messageId: chatMessageIdOf(n), speaker }), receivedAtMs: n };
  });
}

describe('ChatFeed lines', () => {
  let props: ChatFeedProps;

  beforeEach(() => {
    props = {
      name: 'Mesa',
      messages: spokenInTurns(300),
      rolls: [],
      filter: 'all',
      firstUnreadId: null,
      people: PEOPLE,
      viewerNames: VIEWER_NAMES,
      diceClock: new InteractionClockFake(),
      tabs: openVharnTabs(new TableSessionApiFake()).tabs,
    };
  });

  it('a new message at the end renders only its own line', () => {
    const { rerender } = render(<ChatFeed {...props} />);
    const next = spokenInTurns(301).at(-1)!;
    faces.rendered = 0;

    rerender(<ChatFeed {...props} messages={[...props.messages, next]} />);

    expect(faces.rendered).toBe(1);
  });
});
