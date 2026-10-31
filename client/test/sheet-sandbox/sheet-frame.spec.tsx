import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHEET_PORT_HANDOFF } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrame } from '@/sheet-sandbox/sheet-frame';
import { SheetChannelsFake } from '../support/sheet-frame-fakes';

const LYRA_SRCDOC = '<!doctype html><p>Lyra</p>';

let channels: SheetChannelsFake;
let connected: MessagePort[];
let reloads: number;

function renderLyraSheet(srcdoc = LYRA_SRCDOC) {
  return render(
    <SheetFrame
      srcdoc={srcdoc}
      title="Ficha · Lyra"
      onConnect={(port) => connected.push(port)}
      onReloaded={() => (reloads += 1)}
      createChannel={channels.create}
    />,
  );
}

function sheetFrame(): HTMLIFrameElement {
  return screen.getByTitle('Ficha · Lyra') as HTMLIFrameElement;
}

function spyFramePostMessage() {
  return vi
    .spyOn(sheetFrame().contentWindow as Window, 'postMessage')
    .mockImplementation(() => undefined);
}

beforeEach(() => {
  channels = new SheetChannelsFake();
  connected = [];
  reloads = 0;
});

describe('SheetFrame', () => {
  it('renders an opaque-origin sandbox with no permission and no referrer', () => {
    renderLyraSheet();
    const frame = sheetFrame();
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame).toHaveAttribute('allow', '');
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(frame).toHaveAttribute('srcdoc', LYRA_SRCDOC);
    expect(frame).not.toHaveAttribute('src');
  });

  it('hands the frame its port on the first load and the host end to the parent', () => {
    renderLyraSheet();
    const posted = spyFramePostMessage();
    fireEvent.load(sheetFrame());
    const [channel] = channels.created;
    expect(posted).toHaveBeenCalledWith({ type: SHEET_PORT_HANDOFF }, '*', [channel?.port2]);
    expect(connected).toEqual([channel?.port1]);
    expect(reloads).toBe(0);
  });

  it('a second load destroys the frame, closes the channel and tells the parent', () => {
    renderLyraSheet();
    spyFramePostMessage();
    const frame = sheetFrame();
    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(screen.queryByTitle('Ficha · Lyra')).toBeNull();
    expect(reloads).toBe(1);
    expect(channels.created[0]?.port1.closed).toBe(true);
    expect(channels.created[0]?.port2.closed).toBe(true);
  });

  it('never hands a port on the second load', () => {
    renderLyraSheet();
    const posted = spyFramePostMessage();
    const frame = sheetFrame();
    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(posted).toHaveBeenCalledTimes(1);
    expect(channels.created).toHaveLength(1);
    expect(connected).toHaveLength(1);
  });

  it('keeps the first srcdoc when the prop changes, so a re-render cannot reload the code', () => {
    const view = renderLyraSheet();
    view.rerender(
      <SheetFrame
        srcdoc="<p>outro</p>"
        title="Ficha · Lyra"
        onConnect={(port) => connected.push(port)}
        onReloaded={() => (reloads += 1)}
        createChannel={channels.create}
      />,
    );
    expect(sheetFrame()).toHaveAttribute('srcdoc', LYRA_SRCDOC);
  });

  it('closes the channel when it unmounts', () => {
    const view = renderLyraSheet();
    spyFramePostMessage();
    fireEvent.load(sheetFrame());
    view.unmount();
    expect(channels.created[0]?.port1.closed).toBe(true);
  });
});
