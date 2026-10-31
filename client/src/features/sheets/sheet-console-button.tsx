import { TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { SheetConsoleLog } from '@/sheet-sandbox/sheet-console';
import { consoleErrorCountLabel } from './sheet-console-labels';
import { SheetConsolePanel } from './sheet-console-panel';

export type SheetConsoleButtonProps = Readonly<{ log: SheetConsoleLog; onClear: () => void }>;

/** The console of a sheet in the room, for whoever manages it (the master): a mark in the
 *  sheet's frame with the count of errors, opening the same console the editor has.
 *
 *  Example: `{canManage && <SheetConsoleButton log={console.log} onClear={console.clear} />}` */
export function SheetConsoleButton({ log, onClear }: SheetConsoleButtonProps): React.JSX.Element {
  const errors = log.errors;
  const label = `Console da ficha · ${consoleErrorCountLabel(errors)}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          title={label}
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 gap-1.5 px-2 text-xs tabular-nums',
            errors > 0 ? 'font-semibold text-destructive-text' : 'text-muted-foreground',
          )}
        >
          <TerminalIcon aria-hidden="true" className="size-3.5" />
          {errors > 0 && <span aria-hidden="true">{errors}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Console da ficha"
        className="h-80 w-[min(36rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <SheetConsolePanel log={log} onClear={onClear} className="flex-1" />
      </PopoverContent>
    </Popover>
  );
}
