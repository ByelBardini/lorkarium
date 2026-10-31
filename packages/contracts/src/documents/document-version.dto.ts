import { z } from 'zod';

export const documentVersionDto = z.number().int().nonnegative();
// Shared by document and tab commands; kept apart so document.dto and document-tab.dto
// do not import each other.
export const versionedActionShape = { actionId: z.uuid(), expectedVersion: documentVersionDto };
