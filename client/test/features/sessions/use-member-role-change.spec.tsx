import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { MemberRoleProvider } from '@/features/sessions/member-role-provider';
import {
  roleChangeFailureMessage,
  useRoleChangeFlow,
} from '@/features/sessions/use-member-role-change';
import { CampaignsApiFake, VHARN } from '../../support/campaigns-api-fake';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

describe('useRoleChangeFlow', () => {
  function renderFlow(campaigns = new CampaignsApiFake()) {
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <MemberRoleProvider changer={campaigns}>{children}</MemberRoleProvider>
    );
    const hook = renderHook(() => useRoleChangeFlow(VHARN.id, BIA_AT_TABLE.userId), { wrapper });
    const flow = () => {
      if (!hook.result.current) throw new Error('no role change flow under the provider');
      return hook.result.current;
    };
    return { campaigns, flow };
  }

  const toBia = (role: string) => ({ campaignId: VHARN.id, userId: BIA_AT_TABLE.userId, role });

  it('picking player sends it at once, with no question', () => {
    const { campaigns, flow } = renderFlow();

    act(() => flow().pick('player'));

    expect(flow().asking).toBeNull();
    expect(campaigns.callsOf('setMemberRole')).toEqual([toBia('player')]);
  });

  it.each(['master', 'spectator'] as const)(
    'picking %s asks first; confirming sends it and drops the question',
    (role) => {
      const { campaigns, flow } = renderFlow();

      act(() => flow().pick(role));
      expect(flow().asking).toBe(role);
      expect(campaigns.callsOf('setMemberRole')).toEqual([]);
      act(() => flow().confirm());

      expect(flow().asking).toBeNull();
      expect(campaigns.callsOf('setMemberRole')).toEqual([toBia(role)]);
    },
  );

  it('cancelling drops the question and nothing goes', () => {
    const { campaigns, flow } = renderFlow();

    act(() => flow().pick('master'));
    act(() => flow().cancel());

    expect(flow().asking).toBeNull();
    expect(campaigns.callsOf('setMemberRole')).toEqual([]);
  });

  it('outside the room (no provider) there is no flow', () => {
    const { result } = renderHook(() => useRoleChangeFlow(VHARN.id, BIA_AT_TABLE.userId));

    expect(result.current).toBeNull();
  });
});

describe('roleChangeFailureMessage', () => {
  it('a member who is no longer at the table has their own words', () => {
    expect(roleChangeFailureMessage({ kind: 'member_not_found' })).toBe(
      'Essa pessoa não está mais na mesa.',
    );
  });

  it.each([
    [{ kind: 'forbidden' } as const, 'Só o mestre da mesa pode fazer isso.'],
    [{ kind: 'not_found' } as const, 'Essa mesa não existe ou você não participa dela.'],
    [
      { kind: 'offline' } as const,
      'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    ],
    [
      { kind: 'rate_limited', retryAfterSeconds: 30 } as const,
      'Muitas tentativas. Tente de novo em 30 s.',
    ],
  ])('the other refusals read as the commands of the master (%o)', (failure, message) => {
    expect(roleChangeFailureMessage(failure)).toBe(message);
  });
});
