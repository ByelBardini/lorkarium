import type { ProfileCardDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useState } from 'react';
import type { AccountResult } from '@/services/account-failure';
import type { ProfileCardApi, ProfileCardLoadFailure } from '@/services/profile-card-api';

export type ProfileCardState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; card: ProfileCardDto }>
  | Readonly<{ kind: 'failed'; failure: ProfileCardLoadFailure }>;

export type ProfileCardRead = Readonly<{
  state: ProfileCardState;
  /** Reads the card again (after a vote or a friendship command: the server is the authority);
   *  the card on screen stays until the answer. */
  reload: () => Promise<void>;
}>;

const LOADING: ProfileCardState = { kind: 'loading' };

function stateOf(result: AccountResult<ProfileCardDto, ProfileCardLoadFailure>): ProfileCardState {
  return result.ok
    ? { kind: 'ready', card: result.value }
    : { kind: 'failed', failure: result.failure };
}

/** The card of `userId`, read when `active` turns on (the popover or the modal opens).
 *
 *  Example: `const { state, reload } = useProfileCard(api, userId, open)` */
export function useProfileCard(
  api: ProfileCardApi | null,
  userId: string,
  active: boolean,
): ProfileCardRead {
  const [state, setState] = useState<ProfileCardState>(LOADING);
  const reload = useCallback(async (): Promise<void> => {
    if (api !== null) setState(stateOf(await api.card(userId)));
  }, [api, userId]);
  useEffect(() => {
    if (!active || api === null) return;
    let live = true;
    void api.card(userId).then((result) => {
      if (live) setState(stateOf(result));
    });
    return () => {
      live = false;
    };
  }, [active, api, userId]);
  return { state, reload };
}
