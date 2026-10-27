import { createContext, useContext, useState } from 'react';
import { commandFailureMessage } from '@/features/campaigns/campaign-messages';
import type { CampaignsApi, CampaignsFailure, MemberRole } from '@/services/campaigns-api';

/** What the room needs to change roles (the `CampaignsApi` is one): a member's, from the "Na
 *  mesa" tab, and the admin's own, turning juggernaut mode on and off from the header. */
export type MemberRoleChanger = Pick<
  CampaignsApi,
  'setMemberRole' | 'startJuggernaut' | 'endJuggernaut'
>;

export const MEMBER_GONE_MESSAGE = 'Essa pessoa não está mais na mesa.';

/** Where the room puts its `MemberRoleChanger` (see `MemberRoleProvider`). */
export const MemberRoleContext = createContext<MemberRoleChanger | null>(null);

/** One role change of one member: the request, whether it is on its way and the refusal to show.
 *  On success nothing changes here: the `session:memberUpdated` that follows moves the person. */
export type MemberRoleChange = Readonly<{
  pending: boolean;
  failure: string | null;
  change: (role: MemberRole) => void;
}>;

/** The role change of `userId` at `campaignId`, or `null` when the room gave no way to change it.
 *
 *  Example: `const promotion = useMemberRoleChange(campaignId, duda.userId)` */
export function useMemberRoleChange(campaignId: string, userId: string): MemberRoleChange | null {
  const changer = useContext(MemberRoleContext);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!changer) return null;
  const change = (role: MemberRole): void => {
    setPending(true);
    setFailure(null);
    void changer.setMemberRole(campaignId, userId, role).then((result) => {
      setPending(false);
      if (!result.ok) setFailure(roleChangeFailureMessage(result.failure));
    });
  };
  return { pending, failure, change };
}

/** The roles asked first, in place: becoming master (the secrets open) and moving to the
 *  spectators (the person stops playing). Moving to the players goes at once. */
export type ConfirmedRole = Exclude<MemberRole, 'player'>;

/** A role change with its question: `pick(role)` asks first (`asking`) for a `ConfirmedRole`
 *  and sends any other role at once; `confirm` sends the asked one, `cancel` drops it. */
export type RoleChangeFlow = MemberRoleChange &
  Readonly<{
    asking: ConfirmedRole | null;
    pick: (role: MemberRole) => void;
    confirm: () => void;
    cancel: () => void;
  }>;

/** The role change of `userId` with the question before it, or `null` outside the room.
 *
 *  Example: `const flow = useRoleChangeFlow(campaignId, bia.userId); flow?.pick('master')` */
export function useRoleChangeFlow(campaignId: string, userId: string): RoleChangeFlow | null {
  const change = useMemberRoleChange(campaignId, userId);
  const [asking, setAsking] = useState<ConfirmedRole | null>(null);
  if (!change) return null;
  const pick = (role: MemberRole): void => {
    if (role === 'player') change.change(role);
    else setAsking(role);
  };
  const confirm = (): void => {
    setAsking(null);
    if (asking) change.change(asking);
  };
  return { ...change, asking, pick, confirm, cancel: () => setAsking(null) };
}

/** The words of a refused role change.
 *
 *  Example: `roleChangeFailureMessage({ kind: 'member_not_found' }) // 'Essa pessoa não está mais na mesa.'` */
export function roleChangeFailureMessage(failure: CampaignsFailure): string {
  if (failure.kind === 'member_not_found') return MEMBER_GONE_MESSAGE;
  return commandFailureMessage(failure);
}
