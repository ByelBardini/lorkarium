import { sheetValuePathPatchesDto } from '@lorkarium/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import {
  SHEET_FRAME_BINDINGS_SOURCE,
  type SheetBindingParts,
  type SheetFrameBindingsFactory,
} from '@/sheet-sandbox/sheet-frame-bindings';
import {
  BoundSheetFrameFake,
  SequenceRandomFake,
  SheetPortFake,
} from '../support/sheet-frame-fakes';

const STATE = {
  type: 'state',
  token: { name: 'Lyra', image: null },
  bars: [],
  canEdit: true,
  character: null,
};

let frame: BoundSheetFrameFake;
let port: SheetPortFake;
let random: SequenceRandomFake;

function flushed(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function page(html: string): void {
  frame.document.body.innerHTML = html;
}

function field<T extends Element = HTMLInputElement>(selector: string): T {
  const found = frame.document.querySelector<T>(selector);
  if (!found) throw new Error(`no element ${selector} on the test page`);
  return found;
}

function deliverValues(values: Record<string, unknown>, canEdit = true): void {
  port.deliver({ ...STATE, values, canEdit });
}

function typed(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  element.value = text;
  element.dispatchEvent(new frame.view.Event('input', { bubbles: true }));
}

function patchesSent(): unknown[] {
  return port.sent.filter((message) => (message as { type?: string }).type === 'values.patch');
}

function rollsSent(): unknown[] {
  return port.sent.filter((message) => (message as { type?: string }).type === 'dice.roll');
}

function errorsLogged(): string[] {
  return port.sent
    .filter((message) => (message as { level?: string }).level === 'error')
    .map((message) => (message as { message: string }).message);
}

beforeEach(() => {
  random = new SequenceRandomFake();
  frame = new BoundSheetFrameFake(random);
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

afterEach(() => {
  frame.detach();
});

describe('data-lk: values shown on the page', () => {
  it('a state fills the input bound to a nested path', () => {
    page('<input type="number" data-lk="atributos.forca.base">');
    deliverValues({ atributos: { forca: { base: 2 } } });
    expect(field('input').value).toBe('2');
  });

  it('fills a checkbox, a select and a plain element', () => {
    page(
      '<input type="checkbox" data-lk="treinado"><select data-lk="classe"><option>guerreiro</option><option>mago</option></select><span data-lk="nome"></span>',
    );
    deliverValues({ treinado: true, classe: 'mago', nome: 'Lyra' });
    expect({
      checked: field('input').checked,
      selected: field<HTMLSelectElement>('select').value,
      shown: field('span').textContent,
    }).toEqual({ checked: true, selected: 'mago', shown: 'Lyra' });
  });

  it('a path missing from the values empties the field', () => {
    page('<input data-lk="atributos.forca.base" value="velho">');
    deliverValues({});
    expect(field('input').value).toBe('');
  });

  it('before the first state the page keeps what its html wrote', async () => {
    page('<input data-lk="nome" value="padrão">');
    await flushed();
    expect(field('input').value).toBe('padrão');
  });

  it('an element created after the state binds itself', async () => {
    deliverValues({ hab: { k3f9a1b2: { nome: 'Golpe' } } });
    const created = frame.document.createElement('input');
    created.setAttribute('data-lk', 'hab.k3f9a1b2.nome');
    frame.document.body.append(created);
    await flushed();
    expect(created.value).toBe('Golpe');
  });

  it('a new state does not overwrite the field being typed in, and fills the others', () => {
    page('<input id="a" data-lk="a"><input id="b" data-lk="b">');
    deliverValues({ a: 'x', b: 'y' });
    field('#a').focus();
    typed(field('#a'), 'digitando');
    deliverValues({ a: 'servidor', b: 'novo' });
    expect([field('#a').value, field('#b').value]).toEqual(['digitando', 'novo']);
  });

  it('a contenteditable shows the stored html sanitized', () => {
    page('<div contenteditable="true" data-lk="efeito"></div>');
    deliverValues({ efeito: '<p>ok</p><img src="x" onerror="leak()">' });
    expect(field('div').innerHTML).toBe('<p>ok</p>');
  });
});

describe('data-lk: what the player writes', () => {
  it('typing sends a values.patch with the path', () => {
    page('<input data-lk="atributos.forca.nota">');
    deliverValues({});
    typed(field('input'), 'forte');
    expect(patchesSent()).toEqual([
      expect.objectContaining({
        patches: [{ path: ['atributos', 'forca', 'nota'], value: 'forte' }],
      }),
    ]);
  });

  it('a number field sends a number, and an empty one removes the value', () => {
    page('<input type="number" data-lk="pv">');
    deliverValues({});
    typed(field('input'), '12');
    typed(field('input'), '');
    expect(patchesSent()).toEqual([
      expect.objectContaining({ patches: [{ path: ['pv'], value: 12 }] }),
      expect.objectContaining({ patches: [{ path: ['pv'], value: null }] }),
    ]);
  });

  it('a checkbox sends its state, once for the input and change events', () => {
    page('<input type="checkbox" data-lk="treinado">');
    deliverValues({ treinado: false });
    field('input').click();
    expect(patchesSent()).toEqual([
      expect.objectContaining({ patches: [{ path: ['treinado'], value: true }] }),
    ]);
  });

  it('a select sends the chosen option', () => {
    page('<select data-lk="classe"><option>guerreiro</option><option>mago</option></select>');
    deliverValues({});
    const select = field<HTMLSelectElement>('select');
    select.value = 'mago';
    select.dispatchEvent(new frame.view.Event('change', { bubbles: true }));
    expect(patchesSent()).toEqual([
      expect.objectContaining({ patches: [{ path: ['classe'], value: 'mago' }] }),
    ]);
  });

  it('a contenteditable sends its innerHTML sanitized', () => {
    page('<div contenteditable="true" data-lk="efeito"></div>');
    deliverValues({});
    const editor = field<HTMLDivElement>('div');
    editor.innerHTML = '<p><strong>2 MP</strong></p><img src=x onerror="leak()">';
    editor.dispatchEvent(new frame.view.Event('input', { bubbles: true }));
    expect(patchesSent()).toEqual([
      expect.objectContaining({
        patches: [{ path: ['efeito'], value: '<p><strong>2 MP</strong></p>' }],
      }),
    ]);
  });

  it('a read-only sheet sends nothing', () => {
    page('<input data-lk="nota">');
    deliverValues({}, false);
    typed(field('input'), 'x');
    expect(patchesSent()).toEqual([]);
  });

  it('every patch a binding sends is one the contract accepts', () => {
    page('<input data-lk="a-b.c_d.e1">');
    deliverValues({});
    typed(field('input'), 'v');
    const sent = patchesSent()[0] as { patches: unknown };
    expect(sheetValuePathPatchesDto.safeParse(sent.patches).success).toBe(true);
  });
});

describe('data-lk: a path that is not a value path', () => {
  it.each([['forca..base'], ['__proto__.x'], ['a.b.c.d.e.f.g.h.i'], ['força']])(
    '%s goes to console.error citing the element and the path, and the others still bind',
    (path) => {
      page(`<input id="bad" data-lk="${path}"><input id="good" data-lk="nome">`);
      deliverValues({ nome: 'Lyra' });
      expect({ errors: errorsLogged(), good: field('#good').value }).toEqual({
        errors: [expect.stringContaining(`data-lk "${path}" on <input>`)],
        good: 'Lyra',
      });
    },
  );

  it('typing in it sends nothing', () => {
    page('<input data-lk="forca..base">');
    deliverValues({});
    typed(field('input'), 'x');
    expect(patchesSent()).toEqual([]);
  });
});

describe('data-lk-roll', () => {
  it('replaces each @path by its number and rolls', () => {
    page('<button data-lk-roll="1d20+@atributos.forca.total" data-lk-label="Força">Rolar</button>');
    deliverValues({ atributos: { forca: { total: 3 } } });
    field('button').click();
    expect(rollsSent()).toEqual([
      expect.objectContaining({ expression: '1d20+3', label: 'Força' }),
    ]);
  });

  it('a negative value keeps the notation to one sign', () => {
    page('<button data-lk-roll="1d20+@mod-@pen">Rolar</button>');
    deliverValues({ mod: -2, pen: -1 });
    field('button').click();
    expect(rollsSent()).toEqual([expect.objectContaining({ expression: '1d20-2+1' })]);
  });

  it('a key with a hyphen is read in braces', () => {
    page('<button data-lk-roll="1d8+@{golpe-duplo.dano}">Rolar</button>');
    deliverValues({ 'golpe-duplo': { dano: 2 } });
    field('button').click();
    expect(rollsSent()).toEqual([expect.objectContaining({ expression: '1d8+2' })]);
  });

  it('a hidden roll asks for the masters-only visibility', () => {
    page('<button data-lk-roll="1d20" data-lk-visibility="masters">Rolar</button>');
    deliverValues({});
    field('button').click();
    expect(rollsSent()).toEqual([expect.objectContaining({ visibility: 'masters' })]);
  });

  it('a click on something inside the button rolls too', () => {
    page('<button data-lk-roll="2d6+@bonus"><span>Dano</span></button>');
    deliverValues({ bonus: '4' });
    field('span').click();
    expect(rollsSent()).toEqual([expect.objectContaining({ expression: '2d6+4' })]);
  });

  it.each([
    ['a path missing from the values', {}],
    ['a value that is not a whole number', { bonus: 1.5 }],
    ['text that is not a number', { bonus: 'muito' }],
  ])('%s is refused without rolling', (_case, values) => {
    page('<button data-lk-roll="1d20+@bonus">Rolar</button>');
    deliverValues(values);
    field('button').click();
    expect({ rolls: rollsSent(), errors: errorsLogged() }).toEqual({
      rolls: [],
      errors: [expect.stringContaining('data-lk-roll "1d20+@bonus" needs @bonus')],
    });
  });
});

describe('lorkarium.lists', () => {
  it('add sends a patch at a new 8-character id and resolves to it', async () => {
    deliverValues({});
    const added = frame.sdk.lists.add('hab', { nome: 'Golpe' });
    const sent = patchesSent()[0] as { requestId: string; patches: Array<{ path: string[] }> };
    port.deliver({ type: 'result', requestId: sent.requestId });
    const id = await added;
    expect({ id, patches: sent.patches }).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{8}$/),
      patches: [{ path: ['hab', id], value: { nome: 'Golpe' } }],
    });
  });

  it('add with no item stores an empty object', () => {
    deliverValues({});
    void frame.sdk.lists.add('itens');
    expect(patchesSent()).toEqual([
      expect.objectContaining({ patches: [{ path: ['itens', expect.any(String)], value: {} }] }),
    ]);
  });

  it('add never reuses an id the list already has', () => {
    deliverValues({ hab: { '00000000': { nome: 'velha' } } });
    random.queue(0, 1);
    void frame.sdk.lists.add('hab');
    const sent = patchesSent()[0] as { patches: Array<{ path: string[] }> };
    expect(sent.patches[0]!.path).toEqual(['hab', '11111111']);
  });

  it('remove deletes only that item', () => {
    deliverValues({ hab: { a1: {}, b2: {} } });
    void frame.sdk.lists.remove('hab', 'b2');
    expect(patchesSent()).toEqual([
      expect.objectContaining({ patches: [{ path: ['hab', 'b2'], value: null }] }),
    ]);
  });

  it('items lists the ids with copies of what they hold', () => {
    deliverValues({ hab: { a1: { nome: 'Golpe' }, b2: { nome: 'Cura' } } });
    const read = frame.sdk.lists.items('hab');
    (read[0]!.value as { nome: string }).nome = 'mudado';
    expect(frame.sdk.lists.items('hab')).toEqual([
      { id: 'a1', value: { nome: 'Golpe' } },
      { id: 'b2', value: { nome: 'Cura' } },
    ]);
  });

  it('items of a path that holds no list is empty', () => {
    deliverValues({ hab: 3 });
    expect(frame.sdk.lists.items('hab')).toEqual([]);
  });

  it.each([
    [
      'an invalid list path',
      () => frame.sdk.lists.add('hab..x'),
      /list "hab\.\.x" is not a value path/,
    ],
    [
      'an item that is not an object',
      () => frame.sdk.lists.add('hab', [] as never),
      /list item is object/,
    ],
    [
      'an invalid id',
      () => frame.sdk.lists.remove('hab', '__proto__'),
      /id "__proto__" is not a value key/,
    ],
  ])('%s is refused without sending', async (_case, call, message) => {
    deliverValues({});
    await expect(call()).rejects.toThrow(message);
    expect(patchesSent()).toEqual([]);
  });

  it('lists is frozen', () => {
    expect(Object.isFrozen(frame.sdk.lists)).toBe(true);
  });
});

describe('sheet frame bindings: the serialized text', () => {
  it('runs alone, with no page, and still gives the lists', async () => {
    const create = new Function(
      `return (${SHEET_FRAME_BINDINGS_SOURCE});`,
    )() as SheetFrameBindingsFactory;
    const patched: unknown[] = [];
    const parts: SheetBindingParts = {
      onState: () => () => undefined,
      patch: async (patches) => void patched.push(patches),
      roll: async () => undefined,
      sanitize: (html) => String(html),
      report: () => undefined,
    };
    const id = await create({ crypto: new SequenceRandomFake() }, parts).lists.add('hab');
    expect(patched).toEqual([[{ path: ['hab', id], value: {} }]]);
  });
});
