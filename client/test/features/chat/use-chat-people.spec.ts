import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChatPeople } from '@/features/chat/use-chat-people';
import { createSessionStore } from '@/stores/session-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { biaLeft, vharnState } from '../../support/table-session-fixtures';

describe('useChatPeople', () => {
  function rendered() {
    const presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState({ version: 3 }) });
    const hook = renderHook(() => useChatPeople(presence, createSessionStore()));
    return { presence, hook };
  }

  it('the same roster gives the very same people at every render (the lines are memo)', () => {
    const { hook } = rendered();
    const first = hook.result.current;

    hook.rerender();

    expect(hook.result.current).toBe(first);
  });

  it('someone leaving gives new people, without them online', () => {
    const { presence, hook } = rendered();
    const first = hook.result.current;

    act(() => presence.getState().apply({ kind: 'memberLeft', event: biaLeft({ version: 4 }) }));

    expect(hook.result.current).not.toBe(first);
    expect(hook.result.current.members).toBe(presence.getState().members);
  });
});
