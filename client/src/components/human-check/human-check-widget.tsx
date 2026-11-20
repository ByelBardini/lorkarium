import { useEffect, useEffectEvent, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const LOAD_FAILED = 'Não deu para carregar a verificação. Recarregue a página.';

/** What the widget hands Cloudflare's `turnstile.render` (only the options the app uses). */
export type TurnstileRenderOptions = Readonly<{
  sitekey: string;
  theme: 'dark';
  language: 'pt-BR';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}>;

/** The part of Cloudflare's `window.turnstile` the widget talks to. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let pendingScript: Promise<TurnstileApi> | null = null;

export type HumanCheckWidgetProps = Readonly<{
  siteKey: string;
  /** The token once the challenge passes; `null` when it expires or fails. */
  onToken: (token: string | null) => void;
}>;

/** The Cloudflare Turnstile challenge of the public forms; the only place that loads its script.
 *
 *  Example: `<HumanCheckWidget siteKey={settings.humanCheckSiteKey} onToken={setToken} />` */
export function HumanCheckWidget({ siteKey, onToken }: HumanCheckWidgetProps): React.JSX.Element {
  const { container, loadFailed } = useTurnstileChallenge(siteKey, onToken);
  if (loadFailed) {
    return (
      <p role="alert" className="text-[13px] text-destructive-text">
        {LOAD_FAILED}
      </p>
    );
  }
  return <div ref={container} className="min-h-[65px]" />;
}

function useTurnstileChallenge(
  siteKey: string,
  onToken: (token: string | null) => void,
): Readonly<{ container: React.RefObject<HTMLDivElement | null>; loadFailed: boolean }> {
  const container = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const handOver = useEffectEvent((token: string | null) => onToken(token));
  const failLoad = useEffectEvent(() => {
    setLoadFailed(true);
    onToken(null);
  });
  useEffect(() => {
    let widget: Readonly<{ api: TurnstileApi; id: string }> | null = null;
    let unmounted = false;
    const mount = (api: TurnstileApi): void => {
      if (unmounted || !container.current) return;
      widget = { api, id: renderChallenge(api, container.current, siteKey, handOver) };
    };
    loadTurnstile().then(mount, () => !unmounted && failLoad());
    return () => {
      unmounted = true;
      if (widget) widget.api.remove(widget.id);
    };
  }, [siteKey]);
  return { container, loadFailed };
}

function renderChallenge(
  api: TurnstileApi,
  container: HTMLElement,
  siteKey: string,
  onToken: (token: string | null) => void,
): string {
  const id = api.render(container, {
    sitekey: siteKey,
    theme: 'dark',
    language: 'pt-BR',
    callback: (token) => onToken(token),
    // An expired token would be refused by the server: the form waits for the renewed one.
    'expired-callback': () => {
      onToken(null);
      api.reset(id);
    },
    'error-callback': () => onToken(null),
  });
  return id;
}

// One script for every widget on screen; a failed load is forgotten, so a remount tries again.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  pendingScript ??= appendScript().finally(() => {
    pendingScript = null;
  });
  return pendingScript;
}

function appendScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error(`window.turnstile is missing after ${TURNSTILE_SCRIPT_URL} loaded`)),
    );
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error(`Turnstile script did not load: ${TURNSTILE_SCRIPT_URL}`));
    });
    document.head.append(script);
  });
}
