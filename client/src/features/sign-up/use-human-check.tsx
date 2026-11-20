import { useState } from 'react';
import { HumanCheckWidget } from '@/components/human-check/human-check-widget';

// What the forms send where the server has no Turnstile key (dev): its SkippedHumanCheck takes
// any token, and the production server never runs without a key.
const SKIPPED_HUMAN_CHECK_TOKEN = 'skipped';

export type HumanCheck = Readonly<{
  /** The token to send; `null` while the challenge has not passed. */
  token: string | null;
  /** The challenge, or nothing without a site key. */
  widget: React.ReactNode;
  /** A token goes once to Cloudflare: after each send the form waits for a new one. */
  renew: () => void;
}>;

/** The Turnstile challenge of a public form, renewed after each send.
 *
 *  Example: `const check = useHumanCheck(settings.humanCheckSiteKey); <Button disabled={!check.token}>` */
export function useHumanCheck(siteKey: string | null): HumanCheck {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const renew = (): void => {
    setToken(null);
    setRound((current) => current + 1);
  };
  if (siteKey === null) return { token: SKIPPED_HUMAN_CHECK_TOKEN, widget: null, renew };
  const widget = <HumanCheckWidget key={round} siteKey={siteKey} onToken={setToken} />;
  return { token, widget, renew };
}
