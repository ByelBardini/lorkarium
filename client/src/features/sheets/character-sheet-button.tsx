import type { SheetSummaryDto } from '@lorkarium/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPEN_SHEET } from './sheet-messages';
import {
  GiveSpareSheetItems,
  NewSheetItems,
  OpenSheetItems,
  SheetIconButton,
} from './sheet-menu-parts';
import { useSheetRoom, type SheetRoom } from './sheet-room-context';
import { useTokenSheets } from './use-token-sheets';

export type CharacterSheetButtonProps = Readonly<{
  /** The player whose character it is. */
  memberId: string;
  /** The anchor of their character in the cast; `null` = none yet (the server makes one when the
   *  master gives them a sheet). */
  anchorTokenId: string | null;
  /** The character's name: "Abrir ficha de Lyra", "Fichas de Lyra". */
  name: string;
  isMaster: boolean;
}>;

/** The sheets of a player's character on the "Na mesa" card. A reader with one sheet gets the
 *  button "Abrir ficha de Lyra"; with several, the menu "Fichas de Lyra" to pick one; with none,
 *  nothing. The master always gets the menu, with "Nova ficha ▸ <template>" and "Dar ficha
 *  existente ▸ <sheets nobody holds>" for the player, even before they have a character.
 *
 *  Example: `<CharacterSheetButton memberId={bia.userId} anchorTokenId={card.anchorTokenId ?? null} name="Lyra" isMaster={false} />` */
export function CharacterSheetButton(props: CharacterSheetButtonProps): React.JSX.Element | null {
  const room = useSheetRoom();
  const read = useTokenSheets(room, props.anchorTokenId);
  if (!room || read.status === 'loading') return null;
  if (props.isMaster) return <MasterSheetMenu {...props} room={room} sheets={read.sheets} />;
  const [only] = read.sheets;
  if (!only) return null;
  if (read.sheets.length > 1)
    return <ReaderSheetMenu name={props.name} room={room} sheets={read.sheets} />;
  return (
    <SheetIconButton
      label={`${OPEN_SHEET} de ${props.name}`}
      onClick={() => room.actions.open(only)}
    />
  );
}

type MenuProps = Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[]; name: string }>;

function ReaderSheetMenu({ room, sheets, name }: MenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SheetIconButton label={`Fichas de ${name}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {sheets.map((sheet) => (
          <DropdownMenuItem key={sheet.id} onSelect={() => room.actions.open(sheet)}>
            {sheet.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MasterSheetMenu(props: MenuProps & CharacterSheetButtonProps): React.JSX.Element {
  const holder = { memberId: props.memberId };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SheetIconButton label={`Fichas de ${props.name}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <OpenSheetItems room={props.room} sheets={props.sheets} />
        <NewSheetItems room={props.room} holder={holder} holderName={props.name} />
        <GiveSpareSheetItems room={props.room} holder={holder} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
