import { describe, expect, it } from 'vitest';
import { endJuggernautResponseDto } from '../../src/campaigns/juggernaut.dto';

describe('endJuggernautResponseDto', () => {
  it('carries the role the admin went back to', () => {
    expect(endJuggernautResponseDto.parse({ myRole: 'player' })).toEqual({ myRole: 'player' });
  });

  it('carries null when the admin was not a member and left the campaign', () => {
    expect(endJuggernautResponseDto.parse({ myRole: null })).toEqual({ myRole: null });
  });

  it('refuses a role outside the campaign roles', () => {
    expect(endJuggernautResponseDto.safeParse({ myRole: 'owner' }).success).toBe(false);
  });
});
