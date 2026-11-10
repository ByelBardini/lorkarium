import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHEET_PORT_HANDOFF } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrame, SheetSourceFrame } from '@/sheet-sandbox/sheet-frame';
import { buildSheetSrcdoc, type SheetSource } from '@/sheet-sandbox/sheet-srcdoc';
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

describe('SheetSourceFrame', () => {
  const LYRA: SheetSource = {
    files: [
      { path: 'index.html', content: '<p id="lyra">Lyra</p>' },
      { path: 'script.js', content: 'lorkarium.ready();' },
    ],
  };

  function renderSource(key: number, source: SheetSource = LYRA) {
    return (
      <SheetSourceFrame
        key={key}
        source={source}
        title="Ficha · Lyra"
        onConnect={(port) => connected.push(port)}
        onReloaded={() => (reloads += 1)}
        createChannel={channels.create}
      />
    );
  }

  it('frames the srcdoc built from the author files, scripts listed by hash', () => {
    render(renderSource(1));
    const srcdoc = sheetFrame().getAttribute('srcdoc') ?? '';
    expect(srcdoc).toBe(buildSheetSrcdoc(LYRA));
    expect(srcdoc).toContain("script-src 'sha256-");
    expect(srcdoc).toContain('<body><p id="lyra">Lyra</p><script>\nlorkarium.ready();</script>');
    expect(sheetFrame()).toHaveAttribute('sandbox', 'allow-scripts');
  });

  it('a re-render with other files keeps the frame it built on mount', () => {
    const other = { files: [{ path: 'index.html', content: '<p>Outra</p>' }] };
    const view = render(renderSource(1));
    view.rerender(renderSource(1, other));
    expect(sheetFrame().getAttribute('srcdoc')).toBe(buildSheetSrcdoc(LYRA));
  });

  it('a new frame (a new key) is built from the files it gets', () => {
    const other = { files: [{ path: 'index.html', content: '<p>Outra</p>' }] };
    const view = render(renderSource(1));
    view.rerender(renderSource(2, other));
    expect(sheetFrame().getAttribute('srcdoc')).toBe(buildSheetSrcdoc(other));
  });

  it('files that do not make a page show why, with no frame and no port', () => {
    const broken = { files: [{ path: 'index.html', content: '<lk-include src="sumiu.html">' }] };
    render(
      <SheetSourceFrame
        source={broken}
        title="Ficha · Lyra"
        onConnect={(port) => connected.push(port)}
        onReloaded={() => (reloads += 1)}
        createChannel={channels.create}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A ficha não pôde ser montada: o arquivo "sumiu.html" incluído não existe (index.html, linha 1).',
    );
    expect(screen.queryByTitle('Ficha · Lyra')).toBeNull();
    expect(channels.created).toHaveLength(0);
  });
});
