import { useEffect, useEffectEvent } from 'react';
import { useFetcher } from 'react-router';
import type {
  SettingsActionRequest,
  SettingsActionResult,
  SettingsFailure,
} from './campaign-settings-action';

export type SettingsFetcher = Readonly<{
  /** True from the submit until the detail has been reloaded. */
  busy: boolean;
  /** The answer, once the reload after it is done (the page already shows the new campaign). */
  settled: SettingsActionResult | undefined;
  send: (request: SettingsActionRequest) => void;
}>;

/** One command of the settings page sent to its action, without navigation; each caller has its
 *  own fetcher, so the bar, the code and the deletion read only their own answers.
 *
 *  Example: `const fetcher = useSettingsFetcher(campaign.id); fetcher.send({ intent: 'regenerate-code' })` */
export function useSettingsFetcher(campaignId: string): SettingsFetcher {
  const fetcher = useFetcher<SettingsActionResult>();
  const send = (request: SettingsActionRequest): void => {
    void fetcher.submit(request, {
      method: 'post',
      action: `/campaigns/${encodeURIComponent(campaignId)}/table/settings`,
      encType: 'application/json',
    });
  };
  return {
    busy: fetcher.state !== 'idle',
    settled: fetcher.state === 'idle' ? fetcher.data : undefined,
    send,
  };
}

/** Runs `react` once per new answer, after the render that shows it (it may close a dialog or
 *  drop the draft).
 *
 *  Example: `useOnSettingsSettled(fetcher.settled, (result) => { if ('done' in result) close() })` */
export function useOnSettingsSettled(
  settled: SettingsActionResult | undefined,
  react: (result: SettingsActionResult) => void,
): void {
  const onSettled = useEffectEvent(react);
  useEffect(() => {
    if (settled) onSettled(settled);
  }, [settled]);
}

/** The refusal in a settled answer, or `null` (none yet, or it went through).
 *
 *  Example: `const failure = settingsFailureOf(fetcher.settled)` */
export function settingsFailureOf(
  settled: SettingsActionResult | undefined,
): SettingsFailure | null {
  return settled && 'failure' in settled ? settled.failure : null;
}
