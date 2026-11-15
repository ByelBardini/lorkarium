import type { SheetManifestPermissionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

const SAVED_ROLL_ID = '00000000-0000-4000-8000-000000000003';

function readyPreview(permissions: readonly SheetManifestPermissionDto[] = ['dice:saved']) {
  const port = new SheetHostPortFake();
  createSheetPreviewHost(port, { permissions });
  port.fromFrame({ type: 'ready', requestId: '1' });
  return port;
}

const add = (expression: string) => ({
  type: 'dice.tray.add',
  requestId: '2',
  expression,
  label: 'Bênção',
});
const codesOf = (port: SheetHostPortFake) => port.ofType('error').map(({ code }) => code);

describe('sheet preview host: the tray', () => {
  it('dice.tray.add keeps the piece in a test tray and answers', () => {
    const port = readyPreview();
    port.fromFrame(add('1d4+5'));
    expect(port.ofType('result').at(-1)).toEqual({ type: 'result', requestId: '2' });
  });

  it('the test tray holds 10 parts, as the room’s', () => {
    const port = readyPreview();
    for (let index = 0; index < 11; index += 1) port.fromFrame(add('1d4'));
    expect(codesOf(port)).toEqual(['TRAY_FULL']);
  });

  it('an unreadable piece is INVALID_DICE_EXPRESSION', () => {
    const port = readyPreview();
    port.fromFrame(add('2d'));
    expect(codesOf(port)).toEqual(['INVALID_DICE_EXPRESSION']);
  });

  it('dice.tray.roll is PREVIEW_ONLY', () => {
    const port = readyPreview();
    port.fromFrame(add('1d20'));
    port.fromFrame({ type: 'dice.tray.roll', requestId: '3' });
    expect(codesOf(port)).toEqual(['PREVIEW_ONLY']);
  });

  it('dice.saved.list answers an empty list, and addSaved finds nothing', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'dice.saved.list', requestId: '4' });
    expect(port.ofType('result').at(-1)).toEqual({
      type: 'result',
      requestId: '4',
      value: { rolls: [] },
    });
    port.fromFrame({ type: 'dice.tray.addSaved', requestId: '5', savedRollId: SAVED_ROLL_ID });
    expect(codesOf(port)).toEqual(['SAVED_ROLL_NOT_FOUND']);
  });

  it('dice.saved.list without dice:saved is refused as in the room', () => {
    const port = readyPreview([]);
    port.fromFrame({ type: 'dice.saved.list', requestId: '4' });
    expect(codesOf(port)).toEqual(['PERMISSION_NOT_DECLARED']);
  });
});
