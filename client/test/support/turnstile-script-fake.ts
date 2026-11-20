import type {
  TurnstileApi,
  TurnstileRenderOptions,
} from '@/components/human-check/human-check-widget';

type RenderedWidget = Readonly<{
  id: string;
  container: HTMLElement;
  options: TurnstileRenderOptions;
}>;

/** Stands in for the Cloudflare script: the test decides whether the `<script>` the widget
 *  appended loads (then `window.turnstile` is this fake) or fails, and drives each widget's
 *  callbacks as the real challenge would. `uninstall` in `afterEach`. */
export class TurnstileScriptFake implements TurnstileApi {
  readonly rendered: RenderedWidget[] = [];
  readonly resets: string[] = [];
  readonly removed: string[] = [];

  render(container: HTMLElement, options: TurnstileRenderOptions): string {
    const id = `widget-${this.rendered.length + 1}`;
    this.rendered.push({ id, container, options });
    return id;
  }

  reset(widgetId: string): void {
    this.resets.push(widgetId);
  }

  remove(widgetId: string): void {
    this.removed.push(widgetId);
  }

  /** Every `<script>` of the Cloudflare challenge in the document. */
  scriptTags(): HTMLScriptElement[] {
    return [
      ...document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]'),
    ];
  }

  /** The script arrives: `window.turnstile` exists, then its `load` fires. */
  loadScript(): void {
    window.turnstile = this;
    for (const tag of this.scriptTags()) tag.dispatchEvent(new Event('load'));
  }

  /** The script does not arrive (blocked, offline): its `error` fires. */
  failScript(): void {
    for (const tag of this.scriptTags()) tag.dispatchEvent(new Event('error'));
  }

  /** The person passes the challenge of the last widget. */
  solve(token = 'token-ok'): void {
    this.lastWidget().options.callback(token);
  }

  /** The token of the last widget expires (Cloudflare gives it 300 s). */
  expire(): void {
    this.lastWidget().options['expired-callback']();
  }

  /** The challenge of the last widget fails on Cloudflare's side. */
  failChallenge(): void {
    this.lastWidget().options['error-callback']();
  }

  /** The script already loaded before the page opened (another form used it). */
  preload(): this {
    window.turnstile = this;
    return this;
  }

  uninstall(): void {
    delete window.turnstile;
    for (const tag of this.scriptTags()) tag.remove();
  }

  private lastWidget(): RenderedWidget {
    const last = this.rendered.at(-1);
    if (!last) throw new Error(`no Turnstile widget rendered; rendered: ${this.rendered.length}`);
    return last;
  }
}
