import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CombatRecapLinesProps = Readonly<{
  lines: readonly string[];
  /** Out of combat the recap of the end stays until "Fechar aviso". */
  onDismiss?: () => void;
}>;

/** "Rodada 3 começou.", "Envenenado acabou em Lyra.": what the last change of turn told, as a
 *  polite status (read once by screen readers), each line after a gold mark.
 *
 *  Example: `<CombatRecapLines lines={recap.lines} />` */
export function CombatRecapLines({ lines, onDismiss }: CombatRecapLinesProps) {
  return (
    <div
      role="status"
      aria-label="O que aconteceu"
      className={
        onDismiss ? 'flex items-start gap-2 rounded-md border border-input bg-card p-3' : ''
      }
    >
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="flex items-center gap-2 text-xs text-label">
            <span aria-hidden="true" className="size-1.5 shrink-0 bg-primary" />
            {line}
          </li>
        ))}
      </ul>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Fechar aviso"
          onClick={onDismiss}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
