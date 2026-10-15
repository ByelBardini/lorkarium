import { randomInt } from 'node:crypto';
import { CAMPAIGN_CODE_ALPHABET, CAMPAIGN_CODE_LENGTH } from '@lorkarium/contracts';
import type { CampaignCodePort } from '../../modules/campaigns/campaign-code.port';

/** Join codes drawn uniformly from the contract alphabet (32^8 = 40 bits) over `node:crypto`.
 *
 *  Example: `new CryptoCampaignCode().generate() // 'VHRN7K2Q'` */
export class CryptoCampaignCode implements CampaignCodePort {
  constructor(private readonly nextIndex: (exclusiveMax: number) => number = randomInt) {}

  generate(): string {
    let code = '';
    for (let position = 0; position < CAMPAIGN_CODE_LENGTH; position += 1) {
      code += CAMPAIGN_CODE_ALPHABET.charAt(this.nextIndex(CAMPAIGN_CODE_ALPHABET.length));
    }
    return code;
  }
}
