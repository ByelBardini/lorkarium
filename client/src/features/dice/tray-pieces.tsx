import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiceTray } from '@/lib/dice-tray';

export type TrayPiecesProps = Readonly<{
  tray: DiceTray;
  onRemove: (pieceId: string) => void;
}>;

/** The named parts summed to the tray (saved rolls by their "+", the sheet's buffs), each a chip
 *  "Acerto · 1d20" with its "×". Nothing while there is none.
 *
 *  Example: `<TrayPieces tray={choice.tray} onRemove={(id) => onChoice(withTray(choice, removePiece(choice.tray, id)))} />` */
export function TrayPieces({ tray, onRemove }: TrayPiecesProps): React.JSX.Element | null {
  if (tray.pieces.length === 0) return null;
  return (
    <ul aria-label="Partes na rolagem" className="flex flex-wrap gap-1.5">
      {tray.pieces.map((piece) => (
        <li
          key={piece.id}
          className="flex max-w-full items-center rounded-sm border border-primary/50 bg-primary/10 text-sm"
        >
          <span className="flex min-w-0 items-center py-1 pr-1 pl-2.5">
            <span className="truncate font-medium text-foreground">{piece.label}</span>
            <span className="whitespace-pre text-muted-foreground">{' · '}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {piece.expression}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Tirar ${piece.label} da rolagem`}
            onClick={() => onRemove(piece.id)}
            className="mr-0.5 text-muted-foreground hover:text-destructive-text"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
