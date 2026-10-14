import { describe, expect, it } from 'vitest';
import { CampaignBo } from '../../../src/modules/campaigns/campaign.bo';

describe('CampaignBo', () => {
  it('the owner renames the campaign trimming the name', () => {
    const row = { id: 'c1', ownerId: 'u1', name: 'Old' };
    expect(new CampaignBo(row).renamedBy('u1', '  New  ').name).toBe('New');
  });
});
