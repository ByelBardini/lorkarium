import { ChevronDownIcon, ChevronRightIcon, TerminalIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { SheetConsoleLog } from '@/sheet-sandbox/sheet-console';
import { ConsoleHeightHandle } from './console-height-handle';
import { consoleErrorCountLabel } from './sheet-console-labels';
import { SheetConsolePanel } from './sheet-console-panel';

export type EditorConsoleDockProps = Readonly<{
  log: SheetConsoleLog;
  onClear: () => void;
  open: boolean;
  onToggle: () => void;
  /** The open console's height, in pixels, changed by the edge above it. */
  height: number;
  onResize: (height: number, remember?: boolean) => void;
  onResizeEnd: () => void;
}>;

/** The console under the editor's preview: "Console" opens and closes it, the edge above it
 *  sets its height (open only), and the count of errors stays in its bar even when it is closed.
 *
 *  Example: `<EditorConsoleDock log={log} onClear={clear} open onToggle={toggle} height={192} onResize={resize} onResizeEnd={remember} />` */
export function EditorConsoleDock(props: EditorConsoleDockProps): React.JSX.Element {
  const panelId = useId();
  return (
    <section
      aria-label="Console"
      className="flex shrink-0 flex-col border-t border-border bg-panel"
    >
      {props.open && (
        <ConsoleHeightHandle
          height={props.height}
          onChange={props.onResize}
          onDragEnd={props.onResizeEnd}
        />
      )}
      <ConsoleBar {...props} panelId={panelId} />
      {props.open && (
        <div
          id={panelId}
          style={{ height: props.height }}
          className="flex flex-col border-t border-divider"
        >
          <SheetConsolePanel log={props.log} onClear={props.onClear} className="flex-1" />
        </div>
      )}
    </section>
  );
}

type ConsoleBarProps = Pick<EditorConsoleDockProps, 'log' | 'open' | 'onToggle'> &
  Readonly<{ panelId: string }>;

function ConsoleBar({ log, open, onToggle, panelId }: ConsoleBarProps): React.JSX.Element {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div className="flex h-9 items-center gap-2 px-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
        className="flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-xs font-semibold text-label outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Chevron aria-hidden="true" className="size-3.5" />
        <TerminalIcon aria-hidden="true" className="size-3.5" />
        Console
      </button>
      <p
        aria-label="Erros no console"
        className={cn(
          'text-xs tabular-nums',
          log.errors > 0 ? 'font-semibold text-destructive-text' : 'text-muted-foreground',
        )}
      >
        {consoleErrorCountLabel(log.errors)}
      </p>
    </div>
  );
}
