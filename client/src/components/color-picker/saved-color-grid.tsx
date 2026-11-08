import type { HexColorDto } from '@lorkarium/contracts';
import { X } from 'lucide-react';
import { useRef } from 'react';

export type SavedColorGridProps = Readonly<{
  colors: readonly HexColorDto[];
  onPick: (color: HexColorDto) => void;
  onRemove: (color: HexColorDto) => void;
}>;

/** The colors the account saved, six to a row: a click uses one, the "x" takes it off the list.
 *
 *  Example: `<SavedColorGrid colors={colors} onPick={use} onRemove={remove} />` */
export function SavedColorGrid({
  colors,
  onPick,
  onRemove,
}: SavedColorGridProps): React.JSX.Element {
  const grid = useRef<HTMLDivElement>(null);
  const remove = (color: HexColorDto): void => {
    // Its button is about to vanish: focus falling to the page would close the popover.
    grid.current?.focus();
    onRemove(color);
  };
  return (
    <div ref={grid} tabIndex={-1} className="flex flex-col gap-1.5 outline-none">
      <h3 className="text-[13px] text-label">Cores salvas</h3>
      {colors.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma cor salva ainda.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(6,2rem)] justify-between gap-y-2">
          {colors.map((color) => (
            <SavedColorItem key={color} color={color} onPick={onPick} onRemove={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedColorItem({
  color,
  onPick,
  onRemove,
}: Readonly<{
  color: HexColorDto;
  onPick: (color: HexColorDto) => void;
  onRemove: (color: HexColorDto) => void;
}>): React.JSX.Element {
  const removeName = `Excluir ${color}`;
  return (
    <li className="group relative">
      <button
        type="button"
        aria-label={color}
        title={color}
        style={{ background: color }}
        onClick={() => onPick(color)}
        className="block size-8 rounded-full border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <button
        type="button"
        aria-label={removeName}
        title={removeName}
        onClick={() => onRemove(color)}
        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border border-input bg-card text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-destructive-text focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:opacity-100"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </li>
  );
}
