import type { SheetConsoleMessageDto, SheetTemplateCodeDto } from '@lorkarium/contracts';
import { useCallback, useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { rollAspectOf } from '@/lib/dice-tray';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceCommands } from '@/services/dice-commands';
import type { SheetCommands } from '@/services/sheet-commands';
import type { SheetsApi } from '@/services/sheets-api';
import { createSheetBridgeHost } from '@/sheet-sandbox/sheet-bridge-host';
import { consoleEntryOf, type SheetConsoleSink } from '@/sheet-sandbox/sheet-console';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';
import { isSpareSheet } from '@/lib/sheet-holder';
import type { SheetHolderSource, SheetTokenSource } from '@/sheet-sandbox/sheet-token-source';
import type { SheetStoreState } from '@/stores/sheet-store';
import { SheetConsoleButton } from './sheet-console-button';
import { SheetFrameChrome } from './sheet-frame-chrome';
import { SheetSandboxView } from './sheet-sandbox-view';
import { useSheetConsole, type SheetConsoleModel } from './use-sheet-console';

/** What the panel's bridge turns the frame's requests into. */
export type SheetPanelServices = Readonly<{
  sheetsApi: Pick<SheetsApi, 'image'>;
  sheetCommands: SheetCommands;
  dice: DiceCommands;
  clock: InteractionClock;
  /** The clock of the console's lines (the master's mark). */
  now?: () => Date;
}>;

export type SheetPanelProps = Readonly<{
  campaignId: string;
  /** "Ficha · Lyra". */
  title: string;
  store: StoreApi<SheetStoreState>;
  /** The sheet's holder in the room (its token, or its character); `null` until the table and
   *  the sheet are known (and for a sheet nobody holds, which the frame sees with `token: null`). */
  tokens: SheetHolderSource | null;
  services: SheetPanelServices;
  compact?: boolean;
  onOpenWindow?: () => void;
  onClose?: () => void;
  createChannel?: () => SheetChannel;
}>;

/** One sheet in the room: the app's frame around the sandboxed frame, the bridge on its port and
 *  the watchdog. Mounting again (the window, back to the tab) makes a new frame and reads the
 *  sheet again from the server; losing the token's control reads it again too, and a sheet the
 *  reader may no longer see goes away (the workspace says why). A sheet given to someone else, or
 *  taken from its holder, while open gets a new frame on the new holder. Whoever manages the
 *  sheet (the master) gets the frame's console in the header; nobody else's frame sends it.
 *
 *  Example: `<SheetPanel campaignId={id} title="Ficha · Lyra" store={entry.store} tokens={source} services={deps} />` */
export function SheetPanel(props: SheetPanelProps): React.JSX.Element {
  const { store } = props;
  const status = useStore(store, (state) => state.status);
  const template = useStore(store, (state) => state.template);
  const canEdit = useStore(store, (state) => state.sheet?.canEdit ?? false);
  const holder = useStore(store, (state) => holderOf(state.sheet));
  const canManage = useStore(store, (state) => state.sheet?.canManage ?? false);
  useReadAgainOnMount(store);
  useReadAgainOnControlLoss(store, props.tokens);
  const sheetConsole = useTemplateConsole(template);
  const onConsole = useConsoleSink(canManage ? template : null, sheetConsole, props.services.now);
  const connect = useBridgeOf(props, holder === NOBODY, onConsole);
  return (
    <SheetFrameChrome
      title={props.title}
      templateName={template?.name ?? null}
      canEdit={canEdit}
      compact={props.compact}
      onOpenWindow={props.onOpenWindow}
      onClose={props.onClose}
      tools={
        canManage && <SheetConsoleButton log={sheetConsole.log} onClear={sheetConsole.clear} />
      }
    >
      {status === 'ready' && template ? (
        <SheetSandboxView
          key={holderKeyOf(holder, props.tokens)}
          code={template}
          title={props.title}
          clock={props.services.clock}
          connect={connect}
          createChannel={props.createChannel}
        />
      ) : (
        <SheetLoadState status={status} onRetry={() => void store.getState().load()} />
      )}
    </SheetFrameChrome>
  );
}

const NOBODY = 'nobody';

// Who holds the sheet, as a key: `undefined` while the sheet is not read yet.
function holderOf(sheet: SheetStoreState['sheet']): string | undefined {
  if (!sheet) return undefined;
  if (isSpareSheet(sheet)) return NOBODY;
  return sheet.memberId !== null ? `character:${sheet.memberId}` : `token:${sheet.tokenId}`;
}

// The host never swaps its token source: a new holder (or the room's source arriving) is a new
// frame, so the key names the source the bridge was built on.
function holderKeyOf(holder: string | undefined, tokens: SheetHolderSource | null): string {
  if (holder === NOBODY) return NOBODY;
  return tokens && holder ? holder : 'waiting';
}

// A new version of the template is a new frame: the old frame's lines are stale.
function useTemplateConsole(template: SheetTemplateCodeDto | null): SheetConsoleModel {
  const sheetConsole = useSheetConsole();
  const { clear } = sheetConsole;
  const version = template?.version;
  useEffect(() => clear(), [version, clear]);
  return sheetConsole;
}

const wallNow = (): Date => new Date();

// The lines are placed against the code the frame runs; a player's bridge gets no sink at all.
function useConsoleSink(
  template: SheetTemplateCodeDto | null,
  sheetConsole: SheetConsoleModel,
  now: () => Date = wallNow,
): SheetConsoleSink | undefined {
  const { append } = sheetConsole;
  const sink = useCallback(
    (message: SheetConsoleMessageDto) => {
      if (template) append(consoleEntryOf(message, template, now()));
    },
    [template, append, now],
  );
  return template ? sink : undefined;
}

function useBridgeOf(
  props: SheetPanelProps,
  holderless: boolean,
  onConsole: SheetConsoleSink | undefined,
) {
  const { campaignId, store, tokens, services } = props;
  return useCallback(
    (port: MessagePort, onReady: () => void) =>
      createSheetBridgeHost({
        port,
        campaignId,
        sheet: store,
        token: tokenSourceOf(holderless, tokens),
        images: services.sheetsApi,
        commands: services.sheetCommands,
        dice: services.dice,
        clock: services.clock,
        diceAspect: () => rollAspectOf({ width: window.innerWidth, height: window.innerHeight }),
        onReady,
        onConsole,
      }),
    [campaignId, store, tokens, services, holderless, onConsole],
  );
}

const NO_TOKEN: SheetHolderSource = { current: () => null, subscribe: () => () => undefined };

// `null` only for a sheet nobody holds; a held one whose token is not here yet is loading.
function tokenSourceOf(
  holderless: boolean,
  tokens: SheetHolderSource | null,
): SheetTokenSource | null {
  if (holderless) return null;
  return tokens ?? NO_TOKEN;
}

// The first mount follows the workspace's own read; every later one (the window) reads again.
function useReadAgainOnMount(store: StoreApi<SheetStoreState>): void {
  useEffect(() => {
    if (store.getState().status === 'ready') void store.getState().load();
  }, [store]);
}

// No event says "you lost the control": the token arriving without it does, and the server
// answers the read again (404 for a `controllers` sheet, read-only for a `table` one).
function useReadAgainOnControlLoss(
  store: StoreApi<SheetStoreState>,
  tokens: SheetHolderSource | null,
): void {
  useEffect(() => {
    if (!tokens) return;
    let controlled = tokens.current()?.canControl ?? false;
    return tokens.subscribe(() => {
      const now = tokens.current()?.canControl ?? controlled;
      if (controlled && !now) void store.getState().load();
      controlled = now;
    });
  }, [store, tokens]);
}

function SheetLoadState({
  status,
  onRetry,
}: Readonly<{ status: SheetStoreState['status']; onRetry: () => void }>): React.JSX.Element {
  if (status !== 'failed') {
    return (
      <p role="status" className="px-5 py-4 text-sm text-muted-foreground">
        Carregando ficha…
      </p>
    );
  }
  return (
    <div role="alert" className="flex items-center gap-3 px-5 py-4 text-sm">
      <p className="flex-1 text-destructive-text">Não foi possível abrir a ficha.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
