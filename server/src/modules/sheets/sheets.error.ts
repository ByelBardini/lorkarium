export type SheetErrorCode =
  | 'SHEET_TEMPLATE_NOT_FOUND'
  | 'SHEET_TEMPLATE_VERSION_CONFLICT'
  | 'SHEET_TEMPLATE_IN_USE'
  | 'SHEET_NOT_FOUND'
  | 'SHEET_ACTION_REUSED'
  | 'SHEET_HAS_NO_TOKEN'
  | 'INSUFFICIENT_BAR'
  | 'SHEET_TEMPLATE_ASSET_NOT_FOUND'
  | 'SHEET_TEMPLATE_ASSETS_TOO_LARGE'
  | 'PERMISSION_NOT_DECLARED'
  | 'BAR_LIMIT';

/** Every refusal of the sheets of its own; the edge turns `code` into the HTTP status. */
export class SheetError extends Error {
  constructor(
    readonly code: SheetErrorCode,
    detail: string,
  ) {
    super(detail);
    this.name = 'SheetError';
  }
}

// Also for another table's template: telling them apart leaks which ids exist (§2.6).
export class SheetTemplateNotFoundError extends SheetError {
  constructor(campaignId: string, templateId: string) {
    super('SHEET_TEMPLATE_NOT_FOUND', `Campaign ${campaignId} has no sheet template ${templateId}`);
  }
}

export class SheetTemplateVersionConflictError extends SheetError {
  constructor(templateId: string, expected: number, actual: number) {
    super(
      'SHEET_TEMPLATE_VERSION_CONFLICT',
      `Sheet template ${templateId} version ${actual}; expected ${expected}`,
    );
  }
}

export class SheetTemplateInUseError extends SheetError {
  constructor(templateId: string, sheetCount: number) {
    super(
      'SHEET_TEMPLATE_IN_USE',
      `Sheet template ${templateId} is used by ${sheetCount} sheets; expected none`,
    );
  }
}

// Also for a sheet the reader may not read: a hidden sheet and a missing one look the same.
export class SheetNotFoundError extends SheetError {
  constructor(campaignId: string, target: string) {
    super('SHEET_NOT_FOUND', `No readable sheet for ${target} in campaign ${campaignId}`);
  }
}

export class SheetActionReusedError extends SheetError {
  constructor(actionId: string) {
    super('SHEET_ACTION_REUSED', `Action ${actionId} already applied to a different sheet command`);
  }
}

// A sheet nobody holds has no bars: the frame's bar buttons have nothing to change.
export class SheetHasNoTokenError extends SheetError {
  constructor(sheetId: string) {
    super(
      'SHEET_HAS_NO_TOKEN',
      `Sheet ${sheetId} has no holder; expected a sheet held by a token or a character`,
    );
  }
}

// The label, not the id: the one who pays sees the bar by its name on the sheet.
export class InsufficientBarError extends SheetError {
  constructor(label: string, has: number, needs: number) {
    super('INSUFFICIENT_BAR', `Bar "${label}" has ${has}; expected at least ${needs}`);
  }
}

// Also for an asset of another table or of another purpose: telling them apart leaks ids (§2.6).
export class SheetTemplateAssetNotFoundError extends SheetError {
  constructor(campaignId: string, path: string, assetId: string) {
    super(
      'SHEET_TEMPLATE_ASSET_NOT_FOUND',
      `Manifest asset "${path}" is ${assetId}; expected a sheet template asset of campaign ${campaignId}`,
    );
  }
}

export class SheetTemplateAssetsTooLargeError extends SheetError {
  constructor(bytes: number, limit: number) {
    super(
      'SHEET_TEMPLATE_ASSETS_TOO_LARGE',
      `The template assets have ${bytes} bytes; expected at most ${limit}`,
    );
  }
}

// The master approved the manifest on import: a permission it lacks is never granted by the host.
export class SheetPermissionNotDeclaredError extends SheetError {
  constructor(sheetId: string, permission: string) {
    super(
      'PERMISSION_NOT_DECLARED',
      `Sheet ${sheetId} needs permission ${permission}; expected its template manifest to declare it`,
    );
  }
}

export class SheetBarLimitError extends SheetError {
  constructor(label: string, limit: number) {
    super(
      'BAR_LIMIT',
      `Bar "${label}" does not fit: the holder has ${limit} bars; expected fewer than ${limit}`,
    );
  }
}
