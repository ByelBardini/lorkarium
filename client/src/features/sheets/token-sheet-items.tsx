import type { SheetSummaryDto, TokenDto } from '@lorkarium/contracts';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { RELEASE_FROM_TOKEN } from './sheet-messages';
import { NewSheetItems, OpenSheetItems, SheetVisibilityItems } from './sheet-menu-parts';
import { useSheetRoom, type SheetRoom } from './sheet-room-context';
import { useTokenSheets } from './use-token-sheets';

type SheetToken = Pick<TokenDto, 'id' | 'anchorTokenId'>;

export type TokenSheetItemsProps = Readonly<{
  token: SheetToken;
  /** The token's name: a sheet made here is named "<template> · <name>". */
  name: string;
  /** The master makes, shows and takes sheets; anyone who may read one opens it. */
  isMaster: boolean;
}>;

/** The sheet items of a token's menu: "Abrir ficha" (one sheet) or "Fichas ▸" (several) for
 *  whoever may read them, and the master's "Nova ficha ▸ <template>" (held by the token clicked;
 *  the server puts it on a character's anchor) and, per sheet, "Quem vê a ficha ▸" and "Tirar do
 *  token". Nothing outside a room, or while the sheets are read.
 *
 *  Example: `<TokenSheetItems token={goblin} name={goblin.name} isMaster />` */
export function TokenSheetItems(props: TokenSheetItemsProps): React.JSX.Element | null {
  const room = useSheetRoom();
  const read = useTokenSheets(room, props.token.anchorTokenId ?? props.token.id);
  if (!room || read.status === 'loading') return null;
  return (
    <>
      <OpenSheetItems room={room} sheets={read.sheets} />
      {props.isMaster && (
        <>
          <NewSheetItems room={room} holder={{ tokenId: props.token.id }} holderName={props.name} />
          <ManageSheetsItems room={room} sheets={read.sheets} />
        </>
      )}
    </>
  );
}

type ManageProps = Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[] }>;

// One sheet: its items flat; several: a submenu per sheet, by name.
function ManageSheetsItems({ room, sheets }: ManageProps): React.JSX.Element | null {
  const [only] = sheets;
  if (!only) return null;
  if (sheets.length === 1) return <ManageSheetItems room={room} sheet={only} />;
  return (
    <>
      {sheets.map((sheet) => (
        <DropdownMenuSub key={sheet.id}>
          <DropdownMenuSubTrigger>{`Ficha ${sheet.name}`}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ManageSheetItems room={room} sheet={sheet} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}

function ManageSheetItems({
  room,
  sheet,
}: Readonly<{ room: SheetRoom; sheet: SheetSummaryDto }>): React.JSX.Element {
  return (
    <>
      <SheetVisibilityItems room={room} sheet={sheet} />
      <DropdownMenuItem onSelect={() => room.actions.give(sheet, null)}>
        {RELEASE_FROM_TOKEN}
      </DropdownMenuItem>
    </>
  );
}
