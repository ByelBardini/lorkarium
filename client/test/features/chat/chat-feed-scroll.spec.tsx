import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { openVharnChat, receiveChat, renderChatPanel } from '../../support/chat-panel-harness';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const NOTICE = { name: 'Novas mensagens' };

function feed(): HTMLElement {
  return screen.getByRole('log', { name: 'Mensagens: Mesa' });
}

// jsdom lays nothing out: the feed's height is set by hand, as a browser would measure it.
function setFeedHeight(scrollHeight: number): void {
  Object.defineProperty(feed(), 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(feed(), 'clientHeight', { configurable: true, value: 300 });
}

function scrollFeedTo(top: number): void {
  act(() => {
    feed().scrollTop = top;
    feed().dispatchEvent(new Event('scroll'));
  });
}

describe('ChatFeed — following the end', () => {
  let deps: TestDependencies;
  let serial = 1;

  beforeEach(() => {
    deps = testDependencies();
    openVharnChat(deps);
    renderChatPanel(deps);
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(serial) }));
    setFeedHeight(900);
    scrollFeedTo(600);
  });

  function arrive(scrollHeight: number, fromUserId?: string): void {
    serial += 1;
    setFeedHeight(scrollHeight);
    const changes = fromUserId === undefined ? {} : { fromUserId };
    receiveChat(deps, chatSent({ messageId: chatMessageIdOf(serial), text: 'Nova.', ...changes }));
  }

  it('at the end, a message from someone else scrolls to it', () => {
    arrive(1000);
    expect(feed().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });

  it('scrolled up, a message from someone else keeps the place and offers "Novas mensagens"', () => {
    scrollFeedTo(100);
    arrive(1000);
    expect(feed().scrollTop).toBe(100);
    expect(screen.getByRole('button', NOTICE)).toBeInTheDocument();
  });

  it('scrolled up, my own message takes me to the end', () => {
    scrollFeedTo(100);
    arrive(1000, ANA.id);
    expect(feed().scrollTop).toBe(1000);
  });

  it('back at the end, following comes back', () => {
    scrollFeedTo(100);
    arrive(1000);
    scrollFeedTo(700);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
    arrive(1100);
    expect(feed().scrollTop).toBe(1100);
  });

  it('"Novas mensagens" goes to the end', async () => {
    scrollFeedTo(100);
    arrive(1000);
    await userEvent.click(screen.getByRole('button', NOTICE));
    expect(feed().scrollTop).toBe(1000);
    expect(screen.queryByRole('button', NOTICE)).not.toBeInTheDocument();
  });
});
