export type SheetErrorCode =
  | 'SHEET_TEMPLATE_NOT_FOUND'
  | 'SHEET_TEMPLATE_VERSION_CONFLICT'
  | 'SHEET_TEMPLATE_IN_USE'
  | 'SHEET_NOT_FOUND'
  | 'SHEET_ACTION_REUSED'
  | 'SHEET_HAS_NO_TOKEN';

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
    super('SHEET_HAS_NO_TOKEN', `Sheet ${sheetId} has no holder; expected a sheet held by a token`);
  }
}
