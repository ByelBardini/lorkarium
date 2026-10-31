import type { SheetTemplateCodeDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { SheetBridgeHost } from '@/sheet-sandbox/sheet-bridge-host';
import { SheetFrame, type SheetChannel } from '@/sheet-sandbox/sheet-frame';
import { buildSheetSrcdoc } from '@/sheet-sandbox/sheet-srcdoc';

/** How long a new frame has to say `ready` before the room offers "Recarregar". */
export const SHEET_READY_TIMEOUT_MS = 5000;
export const SHEET_SILENT = 'A ficha não respondeu';
export const SHEET_RELOADED = 'Ficha recarregada';

/** `silent`: no `ready` in time (a loop, a crash); `reloaded`: the frame navigated itself and was
 *  destroyed (a second `load`). */
export type SheetFrameHealth = 'starting' | 'ready' | 'silent' | 'reloaded';

export type SheetSandboxViewProps = Readonly<{
  code: SheetTemplateCodeDto;
  title: string;
  clock: InteractionClock;
  /** Speaks for the frame on its port; `onReady` is the frame's `ready`. */
  connect: (port: MessagePort, onReady: () => void) => SheetBridgeHost;
  createChannel?: () => SheetChannel;
}>;

/** One sheet's frame and its watchdog: a new frame per template version and per "Recarregar",
 *  the bridge of the old one disposed. No `ready` in `SHEET_READY_TIMEOUT_MS` says "A ficha não
 *  respondeu" over the frame; a second `load` leaves only "Ficha recarregada".
 *
 *  Example: `<SheetSandboxView code={template} title="Ficha · Lyra" clock={clock} connect={bridgeOf} />` */
export function SheetSandboxView(props: SheetSandboxViewProps): React.JSX.Element {
  const [generation, setGeneration] = useState(0);
  const frameKey = `${props.code.version}:${generation}`;
  const { health, onReady, onReloaded } = useFrameHealth(props.clock, frameKey);
  const bridge = useSheetBridge(props.connect, onReady);
  const srcdoc = useMemo(() => buildSheetSrcdoc(props.code), [props.code]);
  const reload = (): void => {
    bridge.dispose();
    setGeneration((current) => current + 1);
  };
  if (health === 'reloaded') {
    return (
      <SheetProblem
        title={SHEET_RELOADED}
        detail="A ficha tentou abrir outra página e foi fechada."
        onReload={reload}
      />
    );
  }
  return (
    <>
      {health === 'silent' && (
        <SheetProblem title={SHEET_SILENT} detail="Ela pode estar travada." onReload={reload} />
      )}
      <SheetFrame
        key={frameKey}
        srcdoc={srcdoc}
        title={props.title}
        onConnect={bridge.attach}
        onReloaded={onReloaded}
        createChannel={props.createChannel}
      />
    </>
  );
}

// The health is kept with the frame it is about: a new frame starts again at `starting`.
function useFrameHealth(
  clock: InteractionClock,
  frameKey: string,
): Readonly<{ health: SheetFrameHealth; onReady: () => void; onReloaded: () => void }> {
  const [health, setHealth] = useState<Readonly<{ key: string; health: SheetFrameHealth }>>({
    key: frameKey,
    health: 'starting',
  });
  const settle = useCallback(
    (next: SheetFrameHealth, only?: SheetFrameHealth) =>
      setHealth((current) => {
        const shown = current.key === frameKey ? current.health : 'starting';
        return only && shown !== only ? current : { key: frameKey, health: next };
      }),
    [frameKey],
  );
  useEffect(
    () => clock.after(SHEET_READY_TIMEOUT_MS, () => settle('silent', 'starting')),
    [clock, settle],
  );
  const onReady = useCallback(() => settle('ready'), [settle]);
  const onReloaded = useCallback(() => settle('reloaded'), [settle]);
  return { health: health.key === frameKey ? health.health : 'starting', onReady, onReloaded };
}

type BridgeSlot = Readonly<{ attach: (port: MessagePort) => void; dispose: () => void }>;

// One bridge at a time: a new port (a new frame) replaces the old bridge, unmounting ends it.
function useSheetBridge(
  connect: SheetSandboxViewProps['connect'],
  onReady: () => void,
): BridgeSlot {
  const current = useRef<SheetBridgeHost | null>(null);
  const dispose = useCallback(() => {
    current.current?.dispose();
    current.current = null;
  }, []);
  useEffect(() => dispose, [dispose]);
  const attach = useCallback(
    (port: MessagePort) => {
      dispose();
      current.current = connect(port, onReady);
    },
    [connect, onReady, dispose],
  );
  return useMemo(() => ({ attach, dispose }), [attach, dispose]);
}

function SheetProblem({
  title,
  detail,
  onReload,
}: Readonly<{ title: string; detail: string; onReload: () => void }>): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-divider bg-panel px-5 py-3 text-sm"
    >
      <p className="min-w-0 flex-1">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground">{` · ${detail}`}</span>
      </p>
      <Button size="sm" variant="outline" onClick={onReload}>
        Recarregar
      </Button>
    </div>
  );
}
