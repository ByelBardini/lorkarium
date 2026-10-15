import { CAMPAIGN_CODE_LENGTH } from '@lorkarium/contracts';

/** The canonical join code as people read it aloud: two groups of four.
 *
 *  Example: `formatCampaignCode('VHRN7K2Q') // 'VHRN-7K2Q'` */
export function formatCampaignCode(code: string): string {
  if (code.length !== CAMPAIGN_CODE_LENGTH) {
    throw new Error(`a join code has ${CAMPAIGN_CODE_LENGTH} symbols; received "${code}"`);
  }
  const half = CAMPAIGN_CODE_LENGTH / 2;
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/** What the join-code field shows while typing: letters and digits only, uppercase, at most
 *  8 symbols, with the hyphen after the fourth. The DTO still decides what is valid.
 *
 *  Example: `maskCampaignCode('vhrn7k') // 'VHRN-7K'` */
export function maskCampaignCode(typed: string): string {
  const symbols = typed
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .slice(0, CAMPAIGN_CODE_LENGTH);
  const half = CAMPAIGN_CODE_LENGTH / 2;
  if (symbols.length <= half) return symbols;
  return `${symbols.slice(0, half)}-${symbols.slice(half)}`;
}
