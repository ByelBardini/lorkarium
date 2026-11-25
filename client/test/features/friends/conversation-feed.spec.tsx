import type { DmSentDto } from '@lorkarium/contracts';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConversationFeed } from '@/features/friends/conversation-feed';
import { BIA, ME_ID, dmSent } from '../../support/friends-fixtures';

const NOTICE = { name: 'Novas mensagens' };

function Feed({ messages }: Readonly<{ messages: readonly DmSentDto[] }>): React.JSX.Element {
  return (
    <ConversationFeed
      messages={messages}
      accountId={ME_ID}
      friend={BIA}
      now={() => new Date(2026, 9, 27)}
      onReply={() => {}}
    />
  );
}

function scroller(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-message-list]');
  if (!element) throw new Error('expected the feed [data-message-list] to be on screen');
  return element;
}

// jsdom lays nothing out: the feed's height is set by hand, as a browser would measure it.
function setFeedHeight(scrollHeight: number): void {
  Object.defineProperty(scroller(), 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(scroller(), 'clientHeight', { configurable: true, value: 300 });
}

function scrollFeedTo(top: number): void {
  act(() => {
    scroller().scrollTop = top;
    scroller().dispatchEvent(new Event('scroll'));
  });
}

function mountScrolledTo(top: number): (messages: readonly DmSentDto[]) => void {
  const first = [dmSent()];
  const view = render(<Feed messages={first} />);
  setFeedHeight(900);
  scrollFeedTo(top);
  return (more) => {
    setFeedHeight(1000);
    view.rerender(<Feed messages={[...first, ...more]} />);
  };
}

describe('ConversationFeed — following the end', () => {
  it('at the end, a message from the friend scrolls to it', () => {
    const arrive = mountScrolledTo(600);
    arrive([dmSent({ text: 'nova' })]);
    expect(scroller().scrollTop).toBe(1000);
  });

  it('scrolled up, a message from the friend keeps the place and offers "Novas mensagens"', () => {
    const arrive = mountScrolledTo(100);
    arrive([dmSent({ text: 'nova' })]);
    expect(scroller().scrollTop).toBe(100);
    expect(screen.getByRole('button', NOTICE)).toBeInTheDocument();
  });

  it('scrolled up, my own message takes me to the end', () => {
    const arrive = mountScrolledTo(100);
    arrive([dmSent({ fromUserId: ME_ID, toUserId: BIA.userId, text: 'minha' })]);
    expect(scroller().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });

  it('an empty conversation still says nobody spoke yet', () => {
    render(<Feed messages={[]} />);
    expect(screen.getByText(/Nenhuma mensagem com Bia ainda/)).toBeInTheDocument();
  });
});
