import { SelfActionError, type BlockingCampaign } from './user-admin.error';

/** What an admin does to an account; the name goes in the refusal and in the audit log. */
export type AdminAction =
  'change the role of' | 'suspend' | 'reactivate' | 'send a new-password link to' | 'delete';

/** An admin never acts on their own account (and so the last admin can never be removed).
 *
 *  Example: `requireOtherAccount(admin.id, targetId, 'suspend')` */
export function requireOtherAccount(actorId: string, targetId: string, action: AdminAction): void {
  if (actorId !== targetId) return;
  throw new SelfActionError(actorId, action);
}

export type OwnedCampaign = BlockingCampaign;

export type DeletionVerdict =
  | Readonly<{ kind: 'blocked'; blockingCampaigns: BlockingCampaign[] }>
  | Readonly<{ kind: 'allowed'; soloCampaigns: number }>;

/** Whether an account can be deleted, from the tables it owns: any with another member blocks it;
 *  otherwise the count of tables that go with it.
 *
 *  Example: `deletionVerdict([{ id, name: 'Vharn', otherMembers: 0 }]) // { kind: 'allowed', soloCampaigns: 1 }` */
export function deletionVerdict(owned: readonly OwnedCampaign[]): DeletionVerdict {
  const blockingCampaigns = owned.filter((campaign) => campaign.otherMembers > 0);
  if (blockingCampaigns.length > 0) return { kind: 'blocked', blockingCampaigns };
  return { kind: 'allowed', soloCampaigns: owned.length };
}
