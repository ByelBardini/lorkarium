import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';

// An iframe stands in for the chat's own window: a document and a realm of its own in jsdom.
function chatWindowBody(): HTMLElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const body = frame.contentDocument?.body;
  if (!body) throw new Error('jsdom gave no contentDocument to a connected iframe');
  return body;
}

// jsdom has no `matchMedia`: the chat window gets one that never matches (a narrow window),
// while the main window keeps none, which `useMediaQuery` reads as desktop.
function narrowViewOf(body: HTMLElement): void {
  const view = body.ownerDocument.defaultView;
  if (!view) throw new Error('the iframe document has no defaultView');
  view.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

function LayoutProbe() {
  return <p>{useMediaQuery(DESKTOP_QUERY) ? 'layout desktop' : 'layout narrow'}</p>;
}

describe('ChatWindowPortal', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll('[data-spec-style]').forEach((style) => style.remove());
  });

  it('draws the children in the chat window body, not in the main document', () => {
    const target = chatWindowBody();

    render(<ChatWindowPortal target={target}>Chat da mesa</ChatWindowPortal>);

    expect(within(target).getByText('Chat da mesa')).toBeInTheDocument();
    expect(screen.queryByText('Chat da mesa')).toBeNull();
  });

  it('copies the main window styles into the chat window and removes them on unmount', () => {
    const style = document.createElement('style');
    style.setAttribute('data-spec-style', '');
    style.textContent = '.chat { color: red }';
    document.head.append(style);
    const target = chatWindowBody();

    const { unmount } = render(<ChatWindowPortal target={target}>Chat</ChatWindowPortal>);
    const copied = () =>
      [...target.ownerDocument.head.querySelectorAll('style')].map((copy) => copy.textContent);
    expect(copied()).toContain('.chat { color: red }');

    unmount();
    expect(copied()).not.toContain('.chat { color: red }');
  });

  it('a popover opened inside mounts its content in the chat window', async () => {
    const target = chatWindowBody();
    render(
      <ChatWindowPortal target={target}>
        <Popover>
          <PopoverTrigger>Pra quem</PopoverTrigger>
          <PopoverContent>Bia</PopoverContent>
        </Popover>
      </ChatWindowPortal>,
    );

    fireEvent.click(within(target).getByRole('button', { name: 'Pra quem' }));

    await waitFor(() => expect(within(target).getByText('Bia')).toBeInTheDocument());
    expect(screen.queryByText('Bia')).toBeNull();
  });

  it('a media query inside reads the chat window viewport, outside the main one', () => {
    const target = chatWindowBody();
    narrowViewOf(target);

    render(
      <>
        <LayoutProbe />
        <ChatWindowPortal target={target}>
          <LayoutProbe />
        </ChatWindowPortal>
      </>,
    );

    expect(within(target).getByText('layout narrow')).toBeInTheDocument();
    expect(screen.getByText('layout desktop')).toBeInTheDocument();
  });

  it('a node of the chat window passes the main window instanceof Node (Radix outside click)', () => {
    const target = chatWindowBody();

    render(<ChatWindowPortal target={target}>Chat</ChatWindowPortal>);

    expect(target instanceof Node).toBe(true);
  });
});
