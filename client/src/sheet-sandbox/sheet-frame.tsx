import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { SHEET_PORT_HANDOFF } from './sheet-bridge-bootstrap';

/** The two ends of a `MessageChannel`; a parameter so the component spec can hand in fakes. */
export interface SheetChannel {
  readonly port1: MessagePort;
  readonly port2: MessagePort;
}

export interface SheetFrameProps {
  /** Read once: the frame is single-use, so a new sheet code needs a new `key`. */
  readonly srcdoc: string;
  readonly title: string;
  /** The host's end of the channel, given once, on the first `load`. */
  readonly onConnect: (port: MessagePort) => void;
  /** A second `load` means the frame navigated itself: it is already gone when this runs. */
  readonly onReloaded: () => void;
  readonly createChannel?: () => SheetChannel;
}

function browserChannel(): SheetChannel {
  return new MessageChannel();
}

function closeChannel(channel: SheetChannel | null): void {
  channel?.port1.close();
  channel?.port2.close();
}

/** The sandboxed iframe of a sheet. Opaque origin (`allow-scripts` without `allow-same-origin`),
 *  no permission, no referrer; the port goes to the frame only on its first `load`, and any later
 *  `load` (the author's code navigated away) destroys the frame.
 *
 *  Example: `<SheetFrame key={code.version} srcdoc={buildSheetSrcdoc(code)} title="Ficha · Lyra" onConnect={bridge.attach} onReloaded={showReloaded} />` */
export function SheetFrame({
  srcdoc,
  title,
  onConnect,
  onReloaded,
  createChannel = browserChannel,
}: SheetFrameProps) {
  const [initialSrcdoc] = useState(srcdoc);
  const [destroyed, setDestroyed] = useState(false);
  const channel = useRef<SheetChannel | null>(null);
  const loads = useRef(0);

  useEffect(() => () => closeChannel(channel.current), []);

  function connect(frameWindow: Window | null): void {
    if (frameWindow === null) return;
    const opened = createChannel();
    channel.current = opened;
    // An opaque origin cannot be named as a target; the first load is the srcdoc itself.
    frameWindow.postMessage({ type: SHEET_PORT_HANDOFF }, '*', [opened.port2]);
    onConnect(opened.port1);
  }

  function handleLoad(event: SyntheticEvent<HTMLIFrameElement>): void {
    loads.current += 1;
    if (loads.current === 1) return connect(event.currentTarget.contentWindow);
    closeChannel(channel.current);
    setDestroyed(true);
    onReloaded();
  }

  if (destroyed) return null;
  return (
    <iframe
      title={title}
      srcDoc={initialSrcdoc}
      sandbox="allow-scripts"
      allow=""
      referrerPolicy="no-referrer"
      className="size-full border-0"
      onLoad={handleLoad}
    />
  );
}
