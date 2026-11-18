import { describe, expect, it } from 'vitest';
import {
  SAVED_ROLLS_MAX,
  sheetBridgeResultValueDto,
  sheetFrameMessageDto,
  sheetManifestPermissionDto,
} from '../../src';

const savedRollId = '00000000-0000-4000-8000-000000000003';

function issuesOf(input: unknown): string {
  const parsed = sheetFrameMessageDto.safeParse(input);
  return parsed.success
    ? ''
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

describe('dice.tray.add', () => {
  it('accepts an expression (trimmed) and a label', () =>
    expect(
      sheetFrameMessageDto.parse({
        type: 'dice.tray.add',
        requestId: '1',
        expression: ' 1d4+5 ',
        label: 'Bênção',
      }),
    ).toEqual({ type: 'dice.tray.add', requestId: '1', expression: '1d4+5', label: 'Bênção' }));

  it('the label is optional', () =>
    expect(
      sheetFrameMessageDto.safeParse({ type: 'dice.tray.add', requestId: '1', expression: '1d4' })
        .success,
    ).toBe(true));

  it('refuses a blank expression, naming the field', () =>
    expect(issuesOf({ type: 'dice.tray.add', requestId: '1', expression: '   ' })).toMatch(
      /^expression:/,
    ));

  it('refuses an extra key', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'dice.tray.add',
        requestId: '1',
        expression: '1d4',
        visibility: 'masters',
      }).success,
    ).toBe(false));
});

describe('dice.tray.addSaved, dice.tray.roll and dice.saved.list', () => {
  it('addSaved takes the saved roll by its uuid', () => {
    const ask = { type: 'dice.tray.addSaved', requestId: '2', savedRollId };
    expect(sheetFrameMessageDto.parse(ask)).toEqual(ask);
    expect(issuesOf({ ...ask, savedRollId: 'acerto' })).toMatch(/^savedRollId:/);
  });

  it('roll and saved.list carry nothing but the request id', () => {
    for (const type of ['dice.tray.roll', 'dice.saved.list']) {
      expect(sheetFrameMessageDto.parse({ type, requestId: '3' })).toEqual({
        type,
        requestId: '3',
      });
      expect(sheetFrameMessageDto.safeParse({ type, requestId: '3', x: 1 }).success).toBe(false);
    }
  });
});

describe('the results of the tray and the saved list', () => {
  const acerto = {
    id: savedRollId,
    name: 'Acerto',
    folderId: null,
    parts: [{ label: null, expression: '1d20+5' }],
    planLocked: false,
  };

  it('saved.list answers the rolls without owner or dates', () => {
    expect(sheetBridgeResultValueDto.parse({ rolls: [acerto] })).toEqual({ rolls: [acerto] });
    expect(
      sheetBridgeResultValueDto.safeParse({ rolls: [{ ...acerto, userId: savedRollId }] }).success,
    ).toBe(false);
    const many = Array.from({ length: SAVED_ROLLS_MAX + 1 }, () => acerto);
    expect(sheetBridgeResultValueDto.safeParse({ rolls: many }).success).toBe(false);
  });

  it('tray.roll answers the total and one entry per part, labeled', () => {
    const rolled = {
      total: 25,
      parts: [
        {
          label: 'Acerto',
          expression: '1d20',
          total: 17,
          dice: [{ sides: 20, value: 17, status: 'kept' }],
        },
        {
          label: 'Bênção',
          expression: '1d4+5',
          total: 8,
          dice: [{ sides: 4, value: 3, status: 'kept' }],
        },
      ],
    };
    expect(sheetBridgeResultValueDto.parse(rolled)).toEqual(rolled);
  });

  it('a tray roll part with the 3D model indices is refused', () => {
    const part = {
      label: null,
      expression: '1d20',
      total: 3,
      dice: [{ sides: 20, value: 3, status: 'kept', model: [0] }],
    };
    expect(sheetBridgeResultValueDto.safeParse({ total: 3, parts: [part] }).success).toBe(false);
  });
});

describe('the dice:saved permission', () => {
  it('is accepted', () =>
    expect(sheetManifestPermissionDto.parse('dice:saved')).toBe('dice:saved'));

  it('a near miss is refused with the expected list', () => {
    const parsed = sheetManifestPermissionDto.safeParse('dice:salvo');
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain('expected one of');
    expect(parsed.error?.issues[0]?.message).toContain('dice:saved');
  });
});
