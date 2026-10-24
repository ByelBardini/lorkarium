import { beforeEach, describe, expect, it } from 'vitest';
import {
  RealtimeTableBoardCommands,
  type NewToken,
  type TokenEdit,
} from '@/services/table-board-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const GRID = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

const BOX_1X1 = { col: 3, row: 4, width: 1, height: 1 };

describe('RealtimeTableBoardCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTableBoardCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTableBoardCommands(transport, () => ACTION_ID);
  });

  it('configureScene sends scene:configure with the action id, the table and the grid', () => {
    void commands.configureScene(VHARN_GRID, GRID);
    expect(transport.sent).toEqual([
      {
        event: 'scene:configure',
        payload: { actionId: ACTION_ID, ...VHARN_GRID, ...GRID },
      },
    ]);
  });

  describe('token commands', () => {
    const LYRA = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
    const PV = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

    it.each([
      [
        'token:move',
        () => commands.moveToken(VHARN_GRID, LYRA, { col: 8, row: 6 }),
        { tokenId: LYRA, col: 8, row: 6 },
      ],
      [
        'token:dragMany',
        () => commands.dragTokens(VHARN_GRID, [{ tokenId: LYRA, cell: { col: 5, row: 4 } }]),
        { drags: [{ tokenId: LYRA, cell: { col: 5, row: 4 } }] },
      ],
      [
        'token:adjustBar',
        () => commands.adjustBar(VHARN_GRID, LYRA, PV, { op: 'add', amount: -7 }),
        { tokenId: LYRA, barId: PV, change: { op: 'add', amount: -7 } },
      ],
      ['token:delete', () => commands.deleteToken(VHARN_GRID, LYRA), { tokenId: LYRA }],
      [
        'token:moveMany',
        () => commands.moveTokens(VHARN_GRID, [{ tokenId: LYRA, col: 8, row: 6 }]),
        { moves: [{ tokenId: LYRA, col: 8, row: 6 }] },
      ],
      [
        'token:dragMany',
        () => commands.dragTokens(VHARN_GRID, [{ tokenId: LYRA, cell: null }]),
        { drags: [{ tokenId: LYRA, cell: null }] },
      ],
      [
        'token:setLayer',
        () => commands.setTokenLayer(VHARN_GRID, [LYRA], 'objects'),
        { tokenIds: [LYRA], layer: 'objects' },
      ],
      [
        'token:faceMany',
        () => commands.faceTokens(VHARN_GRID, [{ tokenId: LYRA, facing: 45 }]),
        { faces: [{ tokenId: LYRA, facing: 45 }] },
      ],
      [
        'token:faceMany',
        () =>
          commands.faceTokens(VHARN_GRID, [{ tokenId: LYRA, facing: 0, expect: { facing: 45 } }]),
        { faces: [{ tokenId: LYRA, facing: 0, expect: { facing: 45 } }] },
      ],
      [
        'token:resizeMany',
        () =>
          commands.resizeTokens(VHARN_GRID, [
            { tokenId: LYRA, col: 2.5, row: 4, width: 1.5, height: 1, expect: BOX_1X1 },
          ]),
        { resizes: [{ tokenId: LYRA, col: 2.5, row: 4, width: 1.5, height: 1, expect: BOX_1X1 }] },
      ],
      [
        'token:restyleMany',
        () => commands.restyleTokens(VHARN_GRID, [LYRA], { frame: 'round' }),
        { tokenIds: [LYRA], style: { frame: 'round' } },
      ],
    ] as const)(
      '%s goes out with the action id, the table and its fields',
      (event, send, fields) => {
        void send();
        expect(transport.sent).toEqual([
          { event, payload: { actionId: ACTION_ID, ...VHARN_GRID, ...fields } },
        ]);
      },
    );

    it('createToken and updateToken send the whole token', () => {
      const token: TokenEdit = {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        width: 1,
        height: 1,
        controllerIds: [],
        bars: [],
      };
      void commands.createToken(VHARN_GRID, { ...token, col: 1, row: 2 });
      void commands.updateToken(VHARN_GRID, LYRA, token);
      expect(transport.sent.map(({ event }) => event)).toEqual(['token:create', 'token:update']);
      expect(transport.sent[1]?.payload).toMatchObject({ tokenId: LYRA, name: 'Lyra' });
    });

    it.each([
      ['OUT_OF_SCENE', 'out_of_scene'],
      ['TOKEN_NOT_FOUND', 'token_not_found'],
      ['BAR_NOT_FOUND', 'token_not_found'],
      ['INVALID_CONTROLLER', 'invalid'],
    ])('a token refusal with %s is %s', async (code, failure) => {
      const result = commands.moveToken(VHARN_GRID, LYRA, { col: 1, row: 1 });
      await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:move');
      expect(await result).toEqual({ ok: false, failure });
    });

    it.each([
      ['FORBIDDEN', 'forbidden'],
      ['TOKEN_NOT_FOUND', 'token_not_found'],
      ['OUT_OF_SCENE', 'out_of_scene'],
    ])('a group move refused with %s is %s', async (code, failure) => {
      const result = commands.moveTokens(VHARN_GRID, [{ tokenId: LYRA, col: 1, row: 1 }]);
      await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:moveMany');
      expect(await result).toEqual({ ok: false, failure });
    });

    it('a resize without expect sends no expect field at all', () => {
      void commands.resizeTokens(VHARN_GRID, [
        { tokenId: LYRA, col: 3, row: 4, width: 2, height: 2 },
      ]);
      expect(JSON.stringify(transport.sent[0]?.payload)).not.toContain('expect');
    });

    it('a turn without expect sends no expect field at all', () => {
      void commands.faceTokens(VHARN_GRID, [{ tokenId: LYRA, facing: 90 }]);
      expect(transport.sent[0]?.payload).toEqual({
        actionId: ACTION_ID,
        ...VHARN_GRID,
        faces: [{ tokenId: LYRA, facing: 90 }],
      });
      expect(JSON.stringify(transport.sent[0]?.payload)).not.toContain('expect');
    });

    it('an image of another table refused with ASSET_NOT_FOUND is asset_not_found', async () => {
      const result = commands.restyleTokens(VHARN_GRID, [LYRA], { imageAssetId: LYRA });
      await transport.answerAck(
        { ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'x' } },
        'token:restyleMany',
      );
      expect(await result).toEqual({ ok: false, failure: 'asset_not_found' });
    });

    it('a layer change whose ack never arrives is offline', async () => {
      const result = commands.setTokenLayer(VHARN_GRID, [LYRA], 'background');
      await transport.timeOutAck('token:setLayer');
      expect(await result).toEqual({ ok: false, failure: 'offline' });
    });
  });

  describe('drawings, token batches and the undo precondition', () => {
    const LYRA = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
    const SQUARE = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
    const CIRCLE = {
      kind: 'ellipse',
      x: 4,
      y: 4,
      width: 2,
      height: 2,
      fill: null,
      stroke: 'gold',
      strokeWidth: 'thin',
    } as const;
    const GOBLIN: NewToken = {
      name: 'Goblin 2',
      initials: 'G2',
      side: 'enemy',
      width: 1,
      height: 1,
      col: 6,
      row: 6,
      layer: 'tokens',
      controllerIds: [],
      bars: [],
    };

    it.each([
      [
        'drawing:createMany',
        () => commands.createDrawings(VHARN_GRID, [CIRCLE]),
        { drawings: [CIRCLE] },
      ],
      [
        'drawing:moveMany',
        () =>
          commands.moveDrawings(VHARN_GRID, [
            { drawingId: SQUARE, x: 6, y: 1, expect: { x: 2.5, y: 3 } },
          ]),
        { moves: [{ drawingId: SQUARE, x: 6, y: 1, expect: { x: 2.5, y: 3 } }] },
      ],
      [
        'drawing:deleteMany',
        () => commands.deleteDrawings(VHARN_GRID, [SQUARE], [{ drawingId: SQUARE, x: 2.5, y: 3 }]),
        { drawingIds: [SQUARE], expect: [{ drawingId: SQUARE, x: 2.5, y: 3 }] },
      ],
      ['token:createMany', () => commands.createTokens(VHARN_GRID, [GOBLIN]), { tokens: [GOBLIN] }],
      [
        'token:deleteMany',
        () => commands.deleteTokens(VHARN_GRID, [LYRA], [{ tokenId: LYRA, col: 3, row: 4 }]),
        { tokenIds: [LYRA], expect: [{ tokenId: LYRA, col: 3, row: 4 }] },
      ],
      [
        'token:moveMany',
        () =>
          commands.moveTokens(VHARN_GRID, [
            { tokenId: LYRA, col: 3, row: 4, expect: { col: 6, row: 4 } },
          ]),
        { moves: [{ tokenId: LYRA, col: 3, row: 4, expect: { col: 6, row: 4 } }] },
      ],
    ])('%s goes with the action id, the table and its fields', (event, send, fields) => {
      void send();
      expect(transport.sent).toEqual([
        { event, payload: { actionId: ACTION_ID, ...VHARN_GRID, ...fields } },
      ]);
    });

    it('a delete with no precondition sends no expect at all (a normal command)', () => {
      void commands.deleteDrawings(VHARN_GRID, [SQUARE]);
      expect(transport.sent[0]?.payload).not.toHaveProperty('expect');
    });

    it.each([
      ['STALE_UNDO', 'stale_undo'],
      ['DRAWING_LIMIT', 'drawing_limit'],
      ['DRAWING_NOT_FOUND', 'drawing_not_found'],
    ])('a refusal with %s is the %s failure', async (code, failure) => {
      const result = commands.moveDrawings(VHARN_GRID, [{ drawingId: SQUARE, x: 0, y: 0 }]);
      await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'drawing:moveMany');
      expect(await result).toEqual({ ok: false, failure });
    });

    it('a creating command answers the ids the server gave, in the order sent', async () => {
      const result = commands.createDrawings(VHARN_GRID, [CIRCLE, CIRCLE]);
      const createdIds = [SQUARE, LYRA];
      await transport.answerAck({ ok: true, version: 7, createdIds }, 'drawing:createMany');
      expect(await result).toEqual({ ok: true, version: 7, createdIds });
    });

    it('a drawing command whose ack never arrives is offline', async () => {
      const result = commands.createDrawings(VHARN_GRID, [CIRCLE]);
      await transport.timeOutAck('drawing:createMany');
      expect(await result).toEqual({ ok: false, failure: 'offline' });
    });
  });
});
