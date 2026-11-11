import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSheetTemplateFile, type SheetTemplateFileContent } from '@/lib/sheet-template-file';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { expandSheetPage, type SheetAssetData } from '@/sheet-sandbox/sheet-page-assembly';
import { buildSheetSrcdoc } from '@/sheet-sandbox/sheet-srcdoc';
import {
  BoundSheetFrameFake,
  SequenceRandomFake,
  SheetPortFake,
} from '../support/sheet-frame-fakes';

// The Lork sheet the e2e imports (e2e/test/fixtures/ficha-lork.lksheet), built from the sources
// in e2e/test/fixtures/ficha-lork/modelo by its build-lksheet.ts.
// Under jsdom `import.meta.url` is not a file: URL; the directory of the spec still is a path.
const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'e2e', 'test', 'fixtures');
const fixtureText = (): string => readFileSync(join(FIXTURES, 'ficha-lork.lksheet'), 'utf8');
const sourceOf = (path: string): string =>
  readFileSync(join(FIXTURES, 'ficha-lork', 'modelo', path), 'utf8');

function lorkTemplate(): SheetTemplateFileContent {
  const reading = readSheetTemplateFile(fixtureText());
  if (!reading.ok) throw new Error(`ficha-lork.lksheet does not read: ${reading.problem}`);
  return reading.template;
}

function assetsOf(template: SheetTemplateFileContent): ReadonlyMap<string, SheetAssetData> {
  return new Map(
    (template.assets ?? []).map(({ path, type, data }) => [path, { type, base64: data }]),
  );
}

describe('the Lork sheet fixture as a .lksheet', () => {
  it('reads as a template asking for the four permissions and the bars HP, MP, EN and ES', () => {
    const template = lorkTemplate();
    expect(template.name).toBe('Ficha de Lork');
    expect(template.manifest.permissions).toEqual([
      'character:stats',
      'character:portrait',
      'sheet:images',
      'character:bars',
    ]);
    expect(template.manifest.bars.map(({ label, max }) => [label, max])).toEqual([
      ['HP', 12],
      ['MP', 10],
      ['EN', 10],
      ['ES', 15],
    ]);
    expect(template.assets?.map(({ path, type }) => [path, type])).toEqual([
      ['fontes/hanken-grotesk.woff2', 'font/woff2'],
      ['fontes/cormorant-garamond.woff2', 'font/woff2'],
      ['fontes/cormorant-garamond-italic.woff2', 'font/woff2'],
      ['fontes/cinzel.woff2', 'font/woff2'],
    ]);
  });

  it('holds the sources as they are now (the file was built again after the last change)', () => {
    for (const { path, content } of lorkTemplate().files) {
      expect(content, `${path} differs from modelo/${path}: run build-lksheet.ts`).toBe(
        sourceOf(path),
      );
    }
  });

  it('builds a page with every include and font inlined, no asset: left', () => {
    const template = lorkTemplate();
    const srcdoc = buildSheetSrcdoc({ files: template.files, assets: assetsOf(template) });
    expect(srcdoc).toContain('id="level-rules"');
    expect(srcdoc).not.toContain('<lk-include');
    expect(srcdoc.match(/url\(["']?data:font\/woff2;base64,/g)).toHaveLength(4);
    expect(srcdoc).not.toMatch(/url\(\s*['"]?asset:/);
  });
});

// The sheet's own code, run in a jsdom page with the real bootstrap: the scripts are classic and
// share one scope, so they run here as one body with the globals they use.
type Message = Readonly<{ type?: string; requestId?: string } & Record<string, unknown>>;

const LYRA = { name: 'Lyra', armorClass: null, difficultyClass: null };
// HP, MP, EN and ES, in this order.
const BAR_IDS = [0, 1, 2, 3].map((i) => `0000000${i}-0000-4000-8000-00000000000${i}`);

// A bar of the table with no fixed formula on the sheet, after the four of the manifest.
const FOLEGO_ID = '00000004-0000-4000-8000-000000000004';

function tableBars(current: Readonly<Record<string, number>>, withFolego = false): unknown[] {
  const bars: [string, number, string][] = [
    ['HP', 12, 'ember'],
    ['MP', 10, 'steel'],
    ['EN', 10, 'moss'],
    ['ES', 15, 'ash'],
  ];
  if (withFolego) bars.push(['Fôlego', 8, 'gold']);
  return bars.map(([label, max, color], position) => ({
    id: position === 4 ? FOLEGO_ID : BAR_IDS[position],
    label,
    current: current[label as string] ?? max,
    max,
    temp: 0,
    color,
    visibility: 'everyone',
    display: 'number',
    position,
  }));
}

let frame: BoundSheetFrameFake;
let port: SheetPortFake;
let pageErrors: unknown[];

function runSheet(template: SheetTemplateFileContent): void {
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  frame.document.body.innerHTML = expandSheetPage(template.files);
  const code = template.files.filter(({ path }) => path.endsWith('.js')).map((f) => f.content);
  const urls = { createObjectURL: () => 'blob:lork', revokeObjectURL: () => undefined };
  const getSelection = frame.view.getSelection.bind(frame.view);
  new Function('window', 'document', 'lorkarium', 'getSelection', 'URL', code.join('\n'))(
    { scrollTo: () => undefined },
    frame.document,
    frame.sdk,
    getSelection,
    urls,
  );
  frame.handOff(port);
}

function deliverState(values: Record<string, unknown>, options: Record<string, unknown> = {}) {
  port.deliver({
    type: 'state',
    token: { name: 'Lyra', image: null },
    bars: tableBars({}),
    values,
    canEdit: true,
    character: LYRA,
    ...options,
  });
}

const sent = (type: string): Message[] =>
  port.sent.filter((message): message is Message => (message as Message).type === type);
const settled = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function element<T extends Element = HTMLElement>(selector: string): T {
  const found = frame.document.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} on the Lork sheet`);
  return found;
}

function click(selector: string): void {
  element(selector).dispatchEvent(new frame.view.MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  frame = new BoundSheetFrameFake(new SequenceRandomFake());
  port = new SheetPortFake();
  pageErrors = [];
  frame.view.addEventListener('error', (event) => pageErrors.push(event.error));
  runSheet(lorkTemplate());
});

afterEach(() => {
  frame.detach();
});

const SKILL = {
  hab: {
    k1: {
      ordem: 1,
      nome: 'Golpe arcano',
      custos: { c1: { ordem: 1, bar: 'MP', v: '6' }, c2: { ordem: 2, bar: 'EN', v: '6' } },
    },
  },
};

describe('the Lork sheet running on a page', () => {
  it('starts, asks for its state and draws the nine tabs and the four bars', async () => {
    deliverState({});
    await settled();
    expect(sent('ready')).toHaveLength(1);
    expect(frame.document.querySelectorAll('[role="tab"]')).toHaveLength(9);
    expect(frame.document.querySelectorAll('[data-barcur]')).toHaveLength(4);
    expect(element<HTMLInputElement>(`[data-barcur="${BAR_IDS[1]}"]`).value).toBe('10');
    expect(pageErrors).toEqual([]);
  });

  it('a tab is chosen by state, never by the location', () => {
    deliverState({});
    click('[data-page="inventario"]');
    expect(element('#pg-inventario').classList.contains('on')).toBe(true);
    expect(element('#pg-perfil').classList.contains('on')).toBe(false);
    expect(element('[data-page="inventario"]').getAttribute('aria-selected')).toBe('true');
  });

  it('"Usar habilidade" spends MP and EN in one bars.spend', async () => {
    deliverState(SKILL);
    await settled();
    click('[data-use="k1"]');
    expect(sent('bars.spend').map(({ costs }) => costs)).toEqual([
      [
        { bar: 'MP', amount: 6 },
        { bar: 'EN', amount: 6 },
      ],
    ]);
  });

  it('a refused spend says which bar is short, from the bars of the table', async () => {
    deliverState(SKILL, { bars: tableBars({ MP: 4 }) });
    await settled();
    click('[data-use="k1"]');
    const [spend] = sent('bars.spend');
    port.deliver({
      type: 'error',
      requestId: spend?.requestId,
      code: 'INSUFFICIENT_BAR',
      message: 'MP',
    });
    await settled();
    expect(element('#use-k1').textContent).toBe('MP insuficiente: tem 4, precisa de 6.');
    expect(element('#use-k1').classList.contains('bad')).toBe(true);
  });

  it('the comfortable long rest fills MP and EN back by bars.adjust', async () => {
    deliverState({}, { bars: tableBars({ MP: 4, EN: 4 }) });
    click('[aria-label="Descansar: longo em lugar confortável"]');
    await settled();
    expect(sent('bars.adjust').map(({ bar, change }) => [bar, change])).toEqual([
      [BAR_IDS[1], { op: 'set', value: 10 }],
      [BAR_IDS[2], { op: 'set', value: 10 }],
      [BAR_IDS[3], { op: 'set', value: 7 }],
    ]);
  });

  it('wearing an armor writes its CA on the character by character.set', async () => {
    deliverState({ armaduras: { a1: { ordem: 1, nome: 'Couro', ca: '14' } } });
    await settled();
    const wear = element<HTMLInputElement>('[data-wear="armaduras.a1"]');
    wear.checked = true;
    wear.dispatchEvent(new frame.view.Event('input', { bubbles: true }));
    expect(sent('values.patch').at(-1)?.patches).toEqual([
      { path: ['armaduras', 'a1', 'emUso'], value: true },
      { path: ['armaduras', 'a1', 'guardado'], value: null },
    ]);
    await settled(700);
    expect(sent('character.set').map(({ changes }) => changes)).toEqual([{ armorClass: 14 }]);
  });

  it('only opening the sheet writes nothing on the character nor on the bars', async () => {
    deliverState({ armaduras: { a1: { ordem: 1, ca: '14', emUso: true } } });
    await settled(700);
    expect(sent('character.set')).toEqual([]);
    expect(sent('bars.adjust')).toEqual([]);
  });

  it('a reader sees the values with every field disabled, the tabs still working', async () => {
    deliverState({ f: { nome: 'Lyra Vandel' }, ...SKILL }, { canEdit: false });
    await settled();
    expect(element<HTMLInputElement>('[data-lk="f.nome"]').value).toBe('Lyra Vandel');
    expect(element<HTMLInputElement>('[data-lk="f.nome"]').disabled).toBe(true);
    expect(element<HTMLButtonElement>('[data-use="k1"]').disabled).toBe(true);
    expect(element('[data-rt="f.mental"]').getAttribute('contenteditable')).toBe('false');
    expect(element<HTMLButtonElement>('[data-page="regras"]').disabled).toBe(false);
  });

  it('a skill image is read by assets.read and shown', async () => {
    const assetId = '11111111-1111-4111-8111-111111111111';
    deliverState({ hab: { k1: { ordem: 1, img: assetId } } });
    const [read] = sent('assets.read');
    expect(read?.assetId).toBe(assetId);
    const value = { type: 'image/png', bytes: new ArrayBuffer(4) };
    port.deliver({ type: 'result', requestId: read?.requestId, value });
    await settled();
    expect(element<HTMLImageElement>('[data-img="hab.k1.img"] img').getAttribute('src')).toBe(
      'blob:lork',
    );
  });
});

describe('the bar formulas of the Lork sheet', () => {
  const folego = (formula: string) => ({
    at: { des: { base: '2' } },
    contas: { c1: { ordem: 1, bar: 'Fôlego', f: formula } },
  });
  // DES 2 also moves the fixed EN formula; these scenarios look at the formula bar alone.
  const folegoChanges = (): unknown[] =>
    sent('bars.adjust')
      .filter(({ bar }) => bar === FOLEGO_ID)
      .map(({ change }) => change);
  const typeInto = (selector: string): void => {
    element(selector).dispatchEvent(new frame.view.Event('input', { bubbles: true }));
  };

  it('shows the fixed formula of each of HP, MP, EN and ES, none undefined', () => {
    deliverState({});
    const rows = [...frame.document.querySelectorAll('table.res tbody tr')];
    expect(rows.map((row) => row.querySelector('.rn')?.textContent)).toEqual([
      'HP',
      'MP',
      'EN',
      'ES',
    ]);
    expect(rows[2]?.querySelector('.rf')?.textContent).toContain('10 + (Dex×2 +');
    expect(element('table.res').textContent).not.toContain('undefined');
  });

  it('a formula for another bar of the table shows its maximum and sends it after an edit', async () => {
    deliverState(folego('10 + DES×2 + Nível'), { bars: tableBars({}, true) });
    await settled();
    expect(element('#cv-c1').textContent).toBe('15');
    expect(element('#cw-c1').textContent).toBe('');
    typeInto('[data-lk="contas.c1.f"]');
    await settled(700);
    expect(folegoChanges()).toEqual([{ op: 'max', value: 15 }]);
  });

  it('multiplies and divides before adding, by name or initials, and rounds down', async () => {
    deliverState(folego('2 + 3 × (4 − 1) ÷ 2 + destreza - Des'), { bars: tableBars({}, true) });
    await settled();
    expect(element('#cv-c1').textContent).toBe('6');
  });

  it('a formula it cannot read says why and sends nothing', async () => {
    deliverState(folego('10 + Sorte'), { bars: tableBars({}, true) });
    await settled();
    expect(element('#cv-c1').textContent).toBe('—');
    expect(element('#cw-c1').textContent).toBe('Conta inválida: não conheço "Sorte".');
    typeInto('[data-lk="contas.c1.f"]');
    await settled(700);
    expect(folegoChanges()).toEqual([]);
  });

  it('only opening a sheet with a formula sends no maximum', async () => {
    deliverState(folego('10 + DES×2'), { bars: tableBars({}, true) });
    await settled(700);
    expect(sent('bars.adjust')).toEqual([]);
  });

  it('suggests only the bars with no fixed formula, and "Adicionar conta" adds one by lists', async () => {
    deliverState({}, { bars: tableBars({}, true) });
    await settled();
    click('[data-add="contas"]');
    await settled();
    expect(sent('values.patch').at(-1)?.patches).toEqual([
      {
        path: ['contas', expect.stringMatching(/^[a-z0-9]{8}$/)],
        value: { ordem: expect.any(Number) },
      },
    ]);
    const options = [...frame.document.querySelectorAll('#contas-bars option')];
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['Fôlego']);
  });

  it('removing a formula keeps its icon on the first click and takes it out on the second', async () => {
    deliverState(folego('10'), { bars: tableBars({}, true) });
    await settled();
    const before = sent('values.patch').length;
    click('[data-rm="contas:c1"]');
    const remove = element('[data-rm="contas:c1"]');
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove.textContent).toBe('');
    expect(remove.getAttribute('aria-label')).toBe('Clique de novo para tirar');
    expect(sent('values.patch')).toHaveLength(before);
    click('[data-rm="contas:c1"]');
    await settled();
    expect(sent('values.patch').at(-1)?.patches).toEqual([{ path: ['contas', 'c1'], value: null }]);
  });

  it('"Adicionar conta" is always there, and a bar with a fixed formula is told', async () => {
    deliverState({ contas: { c1: { ordem: 1, bar: 'hp', f: '10' } } });
    await settled();
    expect(element<HTMLButtonElement>('[data-add="contas"]').hidden).toBe(false);
    expect(element('#cb-c1').textContent).toBe('HP já tem conta fixa.');
  });

  it('a formula for a bar the table lacks creates it after an edit, once, with that maximum', async () => {
    deliverState({
      at: { des: { base: '2' } },
      contas: { c1: { ordem: 1, bar: ' Sorte ', f: '5 + DES' } },
    });
    await settled();
    expect(element('#cb-c1').textContent).toBe(
      'A mesa ainda não tem essa barra: ela é criada com este máximo.',
    );
    expect(sent('bars.create')).toEqual([]);
    typeInto('[data-lk="contas.c1.f"]');
    await settled(700);
    typeInto('[data-lk="contas.c1.f"]');
    await settled(700);
    expect(sent('bars.create').map(({ bar }) => bar)).toEqual([{ label: 'Sorte', max: 7 }]);
  });
});
