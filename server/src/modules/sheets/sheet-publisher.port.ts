import type { SheetChangedEventDto } from '@lorkarium/contracts';

/** Tells the whole table, after the commit, that a sheet changed; no values go with it, so each
 *  client that shows the sheet reads it again by the authorized route. */
export interface SheetPublisherPort {
  sheetChanged(event: SheetChangedEventDto): void;
}
