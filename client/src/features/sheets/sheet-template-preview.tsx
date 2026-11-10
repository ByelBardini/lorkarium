import type { SheetConsoleMessageDto, SheetManifestPermissionDto } from '@lorkarium/contracts';
import { RotateCwIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { SheetPreviewData } from '@/lib/sheet-preview-data';
import { consoleEntryOf, type SheetConsoleEntry } from '@/sheet-sandbox/sheet-console';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';
import { SheetSourceFrame } from '@/sheet-sandbox/sheet-frame';
import { createSheetPreviewHost, type SheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { sameSheetSource, type SheetSource } from '@/sheet-sandbox/sheet-srcdoc';
import { SheetPreviewTestData } from './sheet-preview-test-data';

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
  /** What the draft's manifest declares: the preview refuses the rest, as the room does. */
  permissions?: readonly SheetManifestPermissionDto[];
  /** The character, bars and values the frame runs with, kept above the preview so they outlive
   *  each frame (and the trip to its own window). */
  testData: SheetPreviewData;
  /** The test data after the master edited it or a request of the frame changed it. */
  onTestData: (data: SheetPreviewData) => void;
}>;

/** The live preview of a template: the real sandbox with the test data (the sample "Exemplo",
 *  PV 20/20, until the master edits it under the frame) and no real command; it runs the code
 *  again a moment after the typing stops.
 *
 *  Example: `<SheetTemplatePreview source={{ files }} onConsole={console.append} />` */
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
  useEffect(() => host.current?.setData(props.testData), [props.testData]);
  const { onRun } = props;
  useEffect(() => onRun?.(), [shown.run, onRun]);
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
          <SheetSourceFrame
            key={shown.run}
            source={shown.source}
            title="Prévia da ficha"
            createChannel={props.createChannel}
            onConnect={connect}
            onReloaded={() => setReloaded(true)}
          />
        )}
      </div>
      <SheetPreviewTestData data={props.testData} onChange={props.onTestData} />
    </div>
  );
}

// The lines are placed against the code this frame runs, not the draft typed since.
function previewHostOf(
  port: MessagePort,
  props: SheetTemplatePreviewProps,
  source: SheetSource,
): SheetPreviewHost {
  const { onConsole, now = () => new Date(), permissions } = props;
  const data = { data: props.testData, onDataChange: props.onTestData };
  if (!onConsole) return createSheetPreviewHost(port, { permissions, ...data });
  const sink = (message: SheetConsoleMessageDto): void =>
    onConsole(consoleEntryOf(message, source, now()));
  return createSheetPreviewHost(port, { onConsole: sink, permissions, ...data });
}

type ShownCode = Readonly<{ source: SheetSource; run: number }>;

// A new run mounts a new frame; the same code is not run again unless asked.
function next(current: ShownCode, source: SheetSource, force: boolean): ShownCode {
  const same = sameSheetSource(current.source, source);
  return same && !force ? current : { source, run: current.run + 1 };
}
