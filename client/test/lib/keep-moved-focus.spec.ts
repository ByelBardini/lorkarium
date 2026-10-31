// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { keepMovedFocus } from '@/lib/keep-moved-focus';

describe('keepMovedFocus', () => {
  afterEach(() => document.body.replaceChildren());

  it('keeps a focus that moved outside the modal, so the opener does not take it back', () => {
    const title = document.createElement('input');
    document.body.append(title);
    title.focus();
    const event = new Event('focusScope.autoFocusOnUnmount', { cancelable: true });
    keepMovedFocus(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets the opener take the focus back when nothing outside the modal holds it', () => {
    const event = new Event('focusScope.autoFocusOnUnmount', { cancelable: true });
    keepMovedFocus(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
