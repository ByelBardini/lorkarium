import { describe, expect, it } from 'vitest';
import {
  closedTableMessage,
  juggernautFailureMessage,
} from '@/features/campaigns/campaign-messages';
import { VHARN } from '../../support/campaigns-api-fake';

describe('closedTableMessage', () => {
  it('a table its master deleted names the master', () => {
    const notice = { campaignId: VHARN.id, name: 'Vharn', reason: 'deleted' } as const;

    expect(closedTableMessage(notice)).toBe('A mesa “Vharn” foi excluída pelo mestre.');
  });

  it('a table the person was taken out of says they left it', () => {
    const notice = { campaignId: VHARN.id, name: 'Vharn', reason: 'removed' } as const;

    expect(closedTableMessage(notice)).toBe('Você saiu da mesa “Vharn”.');
  });
});

describe('juggernautFailureMessage', () => {
  it.each([
    [{ kind: 'forbidden' } as const, 'Só um admin entra como juggernaut.'],
    [{ kind: 'already_owner' } as const, 'Você já é o dono desta mesa.'],
    [{ kind: 'not_found' } as const, 'Essa mesa não existe ou você não participa dela.'],
  ])('a refusal %o reads "%s"', (failure, message) => {
    expect(juggernautFailureMessage(failure)).toBe(message);
  });
});
