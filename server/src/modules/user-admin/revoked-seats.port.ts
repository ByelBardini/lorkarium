import type { RevokedAdminSeat } from '../campaigns/campaign-members.dao';

/** Tells the live tables about seats already revoked in the role's transaction (the campaigns
 *  module's `JuggernautService`): privileged access does not outlive the admin role that gave it. */
export interface RevokedSeatsPort {
  announceRevoked(userId: string, seats: readonly RevokedAdminSeat[]): Promise<void>;
}
