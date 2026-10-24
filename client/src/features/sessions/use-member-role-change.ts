import { createContext, useContext, useState } from 'react';
import { commandFailureMessage } from '@/features/campaigns/campaign-messages';
import type { CampaignsApi, CampaignsFailure, MemberRole } from '@/services/campaigns-api';

/** What the "Na mesa" tab needs to change a member's role (the `CampaignsApi` is one). */
export type MemberRoleChanger = Pick<CampaignsApi, 'setMemberRole'>;

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

/** The words of a refused role change.
 *
 *  Example: `roleChangeFailureMessage({ kind: 'member_not_found' }) // 'Essa pessoa não está mais na mesa.'` */
export function roleChangeFailureMessage(failure: CampaignsFailure): string {
  if (failure.kind === 'member_not_found') return MEMBER_GONE_MESSAGE;
  return commandFailureMessage(failure);
}
