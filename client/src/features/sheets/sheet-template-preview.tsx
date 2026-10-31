import type { SheetConsoleMessageDto } from '@lorkarium/contracts';
import { RotateCwIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { consoleEntryOf, type SheetConsoleEntry } from '@/sheet-sandbox/sheet-console';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';
import { SheetFrame } from '@/sheet-sandbox/sheet-frame';
import { createSheetPreviewHost, type SheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { buildSheetSrcdoc, type SheetSource } from '@/sheet-sandbox/sheet-srcdoc';

/** How long the preview waits after the last keystroke before running the new code. */
export const SHEET_PREVIEW_DELAY_MS = 800;

export type SheetTemplatePreviewProps = Readonly<{
  source: SheetSource;
  createChannel?: () => SheetChannel;
  /** A console line of the frame, its position already in the JS file of the code it runs. */
  onConsole?: (entry: Omit<SheetConsoleEntry, 'id'>) => void;
  /** A new frame started (new code or "Rodar de novo"): the old frame's lines are stale. */
  onRun?: () => void;
  now?: () => Date;
  /** More buttons beside "Rodar de novo" (full screen, own window). */
  actions?: ReactNode;
}>;

/** The live preview of a template: the real sandbox with a sample token ("Exemplo", PV 20/20)
 *  and no real command; it runs the code again a moment after the typing stops.
 *
 *  Example: `<SheetTemplatePreview source={{ html, css, js }} onConsole={console.append} />` */
export function SheetTemplatePreview(props: SheetTemplatePreviewProps): React.JSX.Element {
  const [shown, setShown] = useState<ShownCode>({ source: props.source, run: 0 });
  const [reloaded, setReloaded] = useState(false);
  const host = useRef<SheetPreviewHost | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setShown((current) => next(current, props.source, false)),
      SHEET_PREVIEW_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [props.source]);
  useEffect(() => () => host.current?.dispose(), [shown]);
  const { onRun } = props;
  useEffect(() => onRun?.(), [shown.run, onRun]);
  const srcdoc = useMemo(() => buildSheetSrcdoc(shown.source), [shown.source]);
  const rerun = (): void => {
    setReloaded(false);
    setShown((current) => next(current, props.source, true));
  };
  const connect = (port: MessagePort): void => {
    host.current = previewHostOf(port, props, shown.source);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <p className="flex-1 truncate text-xs text-muted-foreground">
          Token de exemplo · nada vai para a mesa
        </p>
        <Button variant="ghost" size="sm" onClick={rerun}>
          <RotateCwIcon aria-hidden="true" />
          Rodar de novo
        </Button>
        {props.actions}
      </div>
      <div className="min-h-64 flex-1 overflow-hidden rounded-sm border border-border bg-background">
        {reloaded ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Ficha recarregada: o código navegou para fora. Rode de novo.
          </p>
        ) : (
          <SheetFrame
            key={shown.run}
            srcdoc={srcdoc}
            title="Prévia da ficha"
            createChannel={props.createChannel}
            onConnect={connect}
            onReloaded={() => setReloaded(true)}
          />
        )}
      </div>
    </div>
  );
}

// The lines are placed against the code this frame runs, not the draft typed since.
function previewHostOf(
  port: MessagePort,
  { onConsole, now = () => new Date() }: SheetTemplatePreviewProps,
  source: SheetSource,
): SheetPreviewHost {
  if (!onConsole) return createSheetPreviewHost(port);
  const sink = (message: SheetConsoleMessageDto): void =>
    onConsole(consoleEntryOf(message, source, now()));
  return createSheetPreviewHost(port, { onConsole: sink });
}

type ShownCode = Readonly<{ source: SheetSource; run: number }>;

// A new run mounts a new frame; the same code is not run again unless asked.
function next(current: ShownCode, source: SheetSource, force: boolean): ShownCode {
  const same =
    current.source.html === source.html &&
    current.source.css === source.css &&
    current.source.js === source.js;
  return same && !force ? current : { source, run: current.run + 1 };
}
