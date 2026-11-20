import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HumanCheckWidget } from '@/components/human-check/human-check-widget';
import { TurnstileScriptFake } from '../../support/turnstile-script-fake';

const SITE_KEY = '1x00000000000000000000AA';

describe('HumanCheckWidget', () => {
  let turnstile: TurnstileScriptFake;
  let tokens: Array<string | null>;
  const onToken = (token: string | null): void => {
    tokens.push(token);
  };

  beforeEach(() => {
    turnstile = new TurnstileScriptFake();
    tokens = [];
  });

  afterEach(() => turnstile.uninstall());

  it('appends the Cloudflare script and renders the challenge with the site key once it loads', async () => {
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    expect(turnstile.scriptTags().map((tag) => tag.src)).toEqual([
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    ]);
    await act(async () => turnstile.loadScript());
    expect(turnstile.rendered.map(({ options }) => options.sitekey)).toEqual([SITE_KEY]);
  });

  it('a solved challenge hands the token to the form', async () => {
    turnstile.preload();
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => undefined);
    act(() => turnstile.solve('token-da-ana'));
    expect(tokens).toEqual(['token-da-ana']);
  });

  it('an expired token is taken back from the form and the challenge renews', async () => {
    turnstile.preload();
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => undefined);
    act(() => turnstile.solve());
    act(() => turnstile.expire());
    expect(tokens).toEqual(['token-ok', null]);
    expect(turnstile.resets).toEqual(['widget-1']);
  });

  it('a failed challenge takes the token back from the form', async () => {
    turnstile.preload();
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => undefined);
    act(() => turnstile.failChallenge());
    expect(tokens).toEqual([null]);
  });

  it('a script that does not load says to reload the page and leaves the form without token', async () => {
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => turnstile.failScript());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não deu para carregar a verificação. Recarregue a página.',
    );
    expect(tokens).toEqual([null]);
    expect(turnstile.rendered).toEqual([]);
  });

  it('two widgets on screen share one script', async () => {
    render(
      <>
        <HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />
        <HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />
      </>,
    );
    expect(turnstile.scriptTags()).toHaveLength(1);
    await act(async () => turnstile.loadScript());
    expect(turnstile.rendered).toHaveLength(2);
  });

  it('a script already on the page is not appended again', async () => {
    turnstile.preload();
    render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => undefined);
    expect(turnstile.scriptTags()).toEqual([]);
    expect(turnstile.rendered).toHaveLength(1);
  });

  it('unmounting removes the challenge from Cloudflare', async () => {
    turnstile.preload();
    const { unmount } = render(<HumanCheckWidget siteKey={SITE_KEY} onToken={onToken} />);
    await act(async () => undefined);
    unmount();
    expect(turnstile.removed).toEqual(['widget-1']);
  });
});
