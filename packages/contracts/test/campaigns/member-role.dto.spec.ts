import { describe, expect, it } from 'vitest';
import { updateMemberRoleRequestDto } from '../../src/campaigns/member-role.dto';

describe('updateMemberRoleRequestDto', () => {
  it('accepts master, the role only owner powers hand out', () => {
    expect(updateMemberRoleRequestDto.parse({ role: 'master' })).toEqual({ role: 'master' });
  });

  it('accepts player and spectator', () => {
    expect(updateMemberRoleRequestDto.parse({ role: 'player' })).toEqual({ role: 'player' });
    expect(updateMemberRoleRequestDto.parse({ role: 'spectator' })).toEqual({ role: 'spectator' });
  });

  it('refuses owner: the ownership never moves through this route', () => {
    expect(updateMemberRoleRequestDto.safeParse({ role: 'owner' }).success).toBe(false);
  });
});
