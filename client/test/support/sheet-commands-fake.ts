import type { BarChangeDto, SheetBarCostDto } from '@lorkarium/contracts';
import type { SheetCommandResult, SheetCommands } from '@/services/sheet-commands';

export type SentSheetBarChange = Readonly<{
  campaignId: string;
  sheetId: string;
  barId: string;
  change: BarChangeDto;
}>;

export type SentSheetBarSpend = Readonly<{
  campaignId: string;
  sheetId: string;
  costs: readonly SheetBarCostDto[];
}>;

/** The sheet commands the host sent: `sent` keeps each `sheet:adjustBar` and `spends` each
 *  `sheet:spendBars`; every one answers `answer` (ok at version 2 by default).
 *
 *  Example: `commands.answer = { ok: false, code: 'BAR_NOT_FOUND' }` */
export class SheetCommandsFake implements SheetCommands {
  readonly sent: SentSheetBarChange[] = [];
  readonly spends: SentSheetBarSpend[] = [];
  answer: SheetCommandResult = { ok: true, version: 2 };

  async adjustBar(
    campaignId: string,
    sheetId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<SheetCommandResult> {
    this.sent.push({ campaignId, sheetId, barId, change });
    return this.answer;
  }

  async spendBars(
    campaignId: string,
    sheetId: string,
    costs: readonly SheetBarCostDto[],
  ): Promise<SheetCommandResult> {
    this.spends.push({ campaignId, sheetId, costs });
    return this.answer;
  }
}
