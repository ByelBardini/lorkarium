import type {
  CreateSheetRequestDto,
  DeleteSheetRequestDto,
  SheetResponseDto,
  SheetSummaryDto,
  SheetValueDto,
  SheetWriteResponseDto,
  UpdateSheetRequestDto,
  UpdateSheetValuesRequestDto,
} from '@lorkarium/contracts';
import type { SheetImage, SheetsApi, SheetsResult } from '@/services/sheets-api';
import { sheetResponse, sheetValuesWrite } from './sheet-fixtures';

type Held<T> = Readonly<{ release: (answer?: SheetsResult<T>) => void }>;

/** One sheet on an in-memory server: `saveValues` merges into `response.sheet.values` and bumps
 *  the version; `detailResult` / `saveResult` override the answer; `holdDetails` / `holdSaves`
 *  keep answers until the test releases them. `images` answers `image(assetId)`.
 *
 *  Example: `api.holdSaves = true; …; api.heldSaves[0]?.release()` */
export class SheetsApiFake implements SheetsApi {
  response: SheetResponseDto = sheetResponse();
  detailResult: SheetsResult<SheetResponseDto> | null = null;
  saveResult: SheetsResult<SheetWriteResponseDto> | null = null;
  holdDetails = false;
  holdSaves = false;
  readonly heldDetails: Held<SheetResponseDto>[] = [];
  readonly heldSaves: Held<SheetWriteResponseDto>[] = [];
  readonly saves: UpdateSheetValuesRequestDto[] = [];
  readonly imageReads: string[] = [];
  images: Record<string, SheetImage> = {};
  detailCalls = 0;
  /** `ofToken` answers the sheets of this token id, else none (`ofTokenResult` overrides). */
  sheetsOfToken: Record<string, readonly SheetSummaryDto[]> = {};
  ofTokenResult: SheetsResult<readonly SheetSummaryDto[]> | null = null;
  readonly ofTokenCalls: string[] = [];
  /** `ofCharacter` answers the sheets of this character id, else none. */
  sheetsOfCharacter: Record<string, readonly SheetSummaryDto[]> = {};
  readonly ofCharacterCalls: string[] = [];
  /** The master's commands answer these (refused by default: the fake has no master). */
  createResult: SheetsResult<SheetWriteResponseDto> = { ok: false, failure: { kind: 'forbidden' } };
  updateResult: SheetsResult<SheetWriteResponseDto> = { ok: false, failure: { kind: 'forbidden' } };
  removeResult: SheetsResult<null> = { ok: false, failure: { kind: 'forbidden' } };
  readonly creates: CreateSheetRequestDto[] = [];
  readonly updates: Array<Readonly<{ sheetId: string; input: UpdateSheetRequestDto }>> = [];
  readonly removes: Array<Readonly<{ sheetId: string; input: DeleteSheetRequestDto }>> = [];

  async detail(): Promise<SheetsResult<SheetResponseDto>> {
    this.detailCalls += 1;
    const answer = (): SheetsResult<SheetResponseDto> =>
      this.detailResult ?? { ok: true, value: this.response };
    if (!this.holdDetails) return answer();
    return new Promise((resolve) =>
      this.heldDetails.push({ release: (held) => resolve(held ?? answer()) }),
    );
  }
  async ofToken(_: string, tokenId: string): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
    this.ofTokenCalls.push(tokenId);
    return this.ofTokenResult ?? { ok: true, value: this.sheetsOfToken[tokenId] ?? [] };
  }
  async ofCharacter(
    _: string,
    characterId: string,
  ): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
    this.ofCharacterCalls.push(characterId);
    return { ok: true, value: this.sheetsOfCharacter[characterId] ?? [] };
  }
  async create(
    _: string,
    input: CreateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    this.creates.push(input);
    return this.createResult;
  }
  async saveValues(
    _: string,
    __: string,
    input: UpdateSheetValuesRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    this.saves.push(input);
    const answer = (): SheetsResult<SheetWriteResponseDto> => this.saveResult ?? this.apply(input);
    if (!this.holdSaves) return answer();
    return new Promise((resolve) =>
      this.heldSaves.push({ release: (held) => resolve(held ?? answer()) }),
    );
  }
  async update(
    _: string,
    sheetId: string,
    input: UpdateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    this.updates.push({ sheetId, input });
    return this.updateResult;
  }
  async remove(
    _: string,
    sheetId: string,
    input: DeleteSheetRequestDto,
  ): Promise<SheetsResult<null>> {
    this.removes.push({ sheetId, input });
    return this.removeResult;
  }
  async image(assetId: string): Promise<SheetsResult<SheetImage>> {
    this.imageReads.push(assetId);
    const image = this.images[assetId];
    return image ? { ok: true, value: image } : { ok: false, failure: { kind: 'not_found' } };
  }

  private apply(input: UpdateSheetValuesRequestDto): SheetsResult<SheetWriteResponseDto> {
    const { sheet } = this.response;
    const values: Record<string, SheetValueDto> = { ...sheet.values };
    for (const [key, value] of Object.entries(input.changes)) {
      if (value === null) delete values[key];
      else values[key] = value;
    }
    const next = { ...sheet, values, version: sheet.version + 1 };
    this.response = { ...this.response, sheet: next };
    return { ok: true, value: sheetValuesWrite(next, input.actionId) };
  }
}
