import {
  DICE_EXPRESSION_MAX_LENGTH,
  DICE_ROLL_LABEL_MAX_LENGTH,
  MAX_BARS_PER_TOKEN,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  SHEET_VALUE_KEY_MAX_LENGTH,
  SHEET_VALUES_MAX_BYTES,
  SHEET_VALUES_MAX_DEPTH,
  SHEET_VALUES_MAX_KEYS,
} from '@lorkarium/contracts';
import { SHEET_DICE_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import { SHEET_VALUES_BATCH_MS } from '@/stores/sheet-store';
import { SHEET_READY_TIMEOUT_MS } from './sheet-sandbox-view';

/** One call of `window.lorkarium`, as the reference tab shows it. */
export type SdkCallDoc = Readonly<{
  signature: string;
  summary: string;
  params: readonly (readonly [name: string, text: string])[];
  returns: string;
  errors: readonly string[];
  example: string;
}>;

/** One row of a two-column table (a field of the state, an error code). */
export type ReferenceRow = readonly [name: string, text: string];

export const SHEET_LIFECYCLE_STEPS: readonly string[] = [
  'O seu JS roda depois do HTML (o DOM já existe). Nesse momento a ficha ainda não sabe nada do token nem dos valores.',
  'Você registra o ouvinte com lorkarium.onState(...) — é ele que desenha a ficha.',
  'Você chama lorkarium.ready(): é a ficha dizendo "estou pronta para receber dados".',
  'A mesa responde com o estado (token, barras, valores, canEdit) e o onState roda pela primeira vez.',
  'Dali em diante, cada mudança (alguém mexe numa barra, um valor é salvo, o token muda) manda um estado novo, e o onState roda de novo.',
];

export const SHEET_LIFECYCLE_WARNING = `Sem ready(), nenhum estado chega: a ficha fica vazia e, depois de ${SHEET_READY_TIMEOUT_MS / 1000} s, a sala mostra "A ficha não respondeu".`;

export const SHEET_STATE_FIELDS: readonly ReferenceRow[] = [
  [
    'token',
    'O token desta ficha: { name, image }. É null quando a ficha não está com ninguém (sem token); aí bars vem vazio.',
  ],
  ['token.name', 'O nome do token, como aparece no tabuleiro. Muda quando o token é renomeado.'],
  [
    'token.image',
    'O retrato em bytes: { type, bytes } (bytes é um ArrayBuffer), ou null sem retrato. A ficha não acessa a rede, por isso a imagem vem pronta — veja o exemplo abaixo.',
  ],
  [
    'bars',
    `As barras do token que quem olha a ficha enxerga (até ${MAX_BARS_PER_TOKEN}). Cada uma tem id, label (o nome, como "PV"), current e max, além de color, display e visibility. Muda quando alguém mexe numa barra.`,
  ],
  [
    'values',
    'Os valores guardados nesta ficha ({ forca: 14, ... }). Já inclui o que a ficha acabou de pedir em values.set, antes de o servidor confirmar.',
  ],
  [
    'canEdit',
    'true se quem olha pode mudar valores e barras; false é só leitura (values.set e bars.adjust são recusados com FORBIDDEN).',
  ],
];

export const TOKEN_IMAGE_EXAMPLE = `lorkarium.onState((estado) => {
  const retrato = estado.token && estado.token.image;
  if (!retrato) return;
  const blob = new Blob([retrato.bytes], { type: retrato.type });
  document.getElementById('retrato').src = URL.createObjectURL(blob);
});`;

export const SDK_CALLS: readonly SdkCallDoc[] = [
  {
    signature: 'lorkarium.ready()',
    summary:
      'Diz à mesa "estou pronta para receber dados". A mesa responde com o primeiro estado e, daí em diante, manda um novo a cada mudança. Chame uma vez, no fim do script.',
    params: [],
    returns: 'Promessa que resolve quando a mesa recebeu o aviso.',
    errors: [],
    example: 'lorkarium.ready();',
  },
  {
    signature: 'lorkarium.onState(ouvinte)',
    summary:
      'Registra a função que desenha a ficha. Ela recebe o estado (veja "O estado") agora, se ele já chegou, e de novo a cada mudança. Um erro dentro dela vai ao console sem impedir os outros ouvintes.',
    params: [['ouvinte', 'função (estado) => { ... }']],
    returns: 'Uma função que, chamada, para de ouvir. Não é promessa.',
    errors: [],
    example: `const parar = lorkarium.onState((estado) => {
  document.getElementById('nome').textContent = estado.token ? estado.token.name : 'Sem token';
});
// parar(); // quando não quiser mais ouvir`,
  },
  {
    signature: 'lorkarium.values.get(chave)',
    summary:
      'Lê um valor do último estado recebido, sem perguntar à mesa. Devolve uma cópia: mudar o objeto devolvido não muda a ficha.',
    params: [['chave', 'o nome do valor, como "forca"']],
    returns: 'O valor, ou undefined se a chave não existe (ou o estado ainda não chegou).',
    errors: [],
    example: "const forca = lorkarium.values.get('forca') ?? 10;",
  },
  {
    signature: 'lorkarium.values.all()',
    summary: 'Uma cópia de todos os valores do último estado.',
    params: [],
    returns: 'Um objeto ({} antes do primeiro estado).',
    errors: [],
    example: 'console.log(lorkarium.values.all());',
  },
  {
    signature: 'lorkarium.values.set(mudanças)',
    summary: `Guarda valores no servidor. Cada chave substitui a guardada por inteiro; null apaga; as outras chaves ficam. Mudanças seguidas vão juntas em um envio a cada ${SHEET_VALUES_BATCH_MS} ms. A última escrita vence, por chave.`,
    params: [
      [
        'mudanças',
        'objeto { chave: valor } com valores JSON (texto, número, booleano, null, lista, objeto)',
      ],
    ],
    returns:
      'Promessa que resolve quando o servidor salvou. O estado com o valor novo chega antes disso.',
    errors: [
      'FORBIDDEN',
      'OFFLINE',
      'INVALID_MESSAGE',
      'TypeError (NaN, Infinity ou função: nada é enviado)',
    ],
    example: 'await lorkarium.values.set({ forca: 16, notas: null });',
  },
  {
    signature: 'lorkarium.bars.list()',
    summary:
      'Uma cópia das barras do último estado, na ordem do token. É aqui que se vê o id de cada barra.',
    params: [],
    returns:
      'Lista de { id, label, current, max, ... } ([] sem token ou antes do primeiro estado).',
    errors: [],
    example: 'console.log(lorkarium.bars.list());',
  },
  {
    signature: 'lorkarium.bars.get(nomeOuId)',
    summary:
      'Acha uma barra do último estado pelo id ou pelo nome (sem diferença de maiúsculas, acentos e espaços nas pontas).',
    params: [['nomeOuId', 'o nome que aparece no token ("PV") ou o id da barra']],
    returns: 'A barra (cópia), ou undefined se nenhuma tem esse nome ou id.',
    errors: ['lança um Error de code BAR_AMBIGUOUS se duas barras têm esse nome'],
    example: "const pv = lorkarium.bars.get('PV');\nif (pv) console.log(pv.current, '/', pv.max);",
  },
  {
    signature: 'lorkarium.bars.adjust(nomeOuId, mudança)',
    summary:
      "Muda uma barra do token desta ficha, para toda a mesa. mudança: { op: 'add', amount } soma (negativo tira), { op: 'set', value } troca o atual, { op: 'max', value } troca o máximo.",
    params: [
      ['nomeOuId', 'o nome da barra ("PV") ou o id dela — veja "Como achar a barra"'],
      ['mudança', "{ op: 'add', amount } | { op: 'set', value } | { op: 'max', value }"],
    ],
    returns: 'Promessa que resolve quando o servidor aplicou. O estado novo chega em seguida.',
    errors: ['FORBIDDEN', 'NO_TOKEN', 'BAR_NOT_FOUND', 'BAR_AMBIGUOUS', 'OFFLINE', 'RATE_LIMITED'],
    example: "await lorkarium.bars.adjust('PV', { op: 'add', amount: -5 });",
  },
  {
    signature: 'lorkarium.dice.roll({ expression, label?, visibility? })',
    summary: `Rola os dados 3D para a mesa. O rótulo sai como "<nome do modelo> · <label>" (até ${DICE_ROLL_LABEL_MAX_LENGTH} caracteres). visibility: 'public' (padrão, todos veem) ou 'masters' (só os mestres). O resultado aparece no histórico de dados; a ficha não recebe o total.`,
    params: [
      ['expression', `a notação, como "1d20+5" (até ${DICE_EXPRESSION_MAX_LENGTH} caracteres)`],
      ['label', 'opcional: o nome da rolagem, como "Ataque"'],
      ['visibility', "opcional: 'public' ou 'masters'"],
    ],
    returns: 'Promessa que resolve quando a mesa aceitou a rolagem.',
    errors: ['INVALID_DICE_EXPRESSION', 'RATE_LIMITED', 'PREVIEW_ONLY', 'OFFLINE'],
    example: "await lorkarium.dice.roll({ expression: '1d20+5', label: 'Ataque' });",
  },
];

export const FIND_BAR_STEPS: readonly string[] = [
  'Use o nome que aparece no token: bars.adjust(\'PV\', ...). Maiúsculas, acentos e espaços nas pontas não importam ("pv", "Pv" e " PV " acham a mesma barra).',
  'Se o token tem duas barras com o mesmo nome, o nome não basta: bars.adjust recusa com BAR_AMBIGUOUS e bars.get lança o mesmo código. Use o id.',
  'O id está em cada barra do estado. Para vê-lo, rode console.log(lorkarium.bars.list()) na prévia do editor (o Console sob a prévia mostra) ou leia estado.bars dentro do onState.',
  'Um id vale para o token desta ficha; outro token tem outros ids. Para um modelo usado por vários tokens, prefira o nome.',
];

export const FIND_BAR_EXAMPLE = `// Pelo nome:
lorkarium.bars.adjust('PV', { op: 'add', amount: -5 });

// Pelo id, quando há duas barras "PV":
lorkarium.onState((estado) => {
  const [primeira] = estado.bars.filter((barra) => barra.label === 'PV');
  if (primeira) lorkarium.bars.adjust(primeira.id, { op: 'set', value: 10 });
});`;

export const VALUES_EXAMPLE = `// Guardar (cada chave substitui a guardada):
lorkarium.values.set({ forca: 14, nivel: 3 });

// Ler (undefined enquanto ninguém salvou):
const nivel = lorkarium.values.get('nivel') ?? 1;

// Apagar:
lorkarium.values.set({ nivel: null });

// Aninhar: a chave guarda o objeto inteiro. Para mudar uma parte,
// leia a cópia, mude e salve a chave de novo.
const inventario = lorkarium.values.get('inventario') ?? { ouro: 0, itens: [] };
inventario.ouro += 10;
lorkarium.values.set({ inventario });`;

export const INPUT_BINDING_EXAMPLE = `<!-- HTML -->
<label>Notas <textarea id="notas"></textarea></label>

// JS
const notas = document.getElementById('notas');
lorkarium.onState((estado) => {
  notas.disabled = !estado.canEdit;
  // Não troque o texto de quem está digitando.
  if (document.activeElement !== notas) notas.value = lorkarium.values.get('notas') ?? '';
});
notas.addEventListener('change', () => {
  lorkarium.values.set({ notas: notas.value }).catch((erro) => console.error(erro.code));
});
lorkarium.ready();`;

export const SHEET_ERROR_CODES: readonly ReferenceRow[] = [
  [
    'FORBIDDEN',
    'Quem olha não pode editar esta ficha (canEdit: false) ou a mesa recusou o pedido.',
  ],
  [
    'OFFLINE',
    'Sem conexão com o servidor. Um values.set recusado assim fica guardado e é reenviado sozinho quando a conexão volta.',
  ],
  ['NO_TOKEN', 'A ficha não está ligada a um token (token: null), então não há barra para mudar.'],
  ['BAR_NOT_FOUND', 'Nenhuma barra do token tem esse nome ou id.'],
  ['BAR_AMBIGUOUS', 'Duas ou mais barras têm esse nome: use o id (veja "Como achar a barra").'],
  [
    'RATE_LIMITED',
    `Pedidos demais em pouco tempo (dados: mais de ${SHEET_DICE_RATE.limit} em ${SHEET_DICE_RATE.windowMs / 1000} s). Espere e tente de novo.`,
  ],
  ['INVALID_DICE_EXPRESSION', 'A notação do dado não foi entendida (a message diz o porquê).'],
  ['PREVIEW_ONLY', 'Na prévia do editor os dados não rolam: abra a ficha de um token na sala.'],
  [
    'INVALID_MESSAGE',
    'O pedido está fora do formato: chave de valor inválida, mudança de barra errada, expressão vazia… A message cita o problema.',
  ],
  ['NOT_FOUND', 'A ficha foi fechada ou desligada enquanto o pedido estava a caminho.'],
  ['UNEXPECTED', 'Resposta inesperada do servidor. Outros códigos do servidor chegam como vieram.'],
];

export const ERROR_HANDLING_EXAMPLE = `try {
  await lorkarium.bars.adjust('PV', { op: 'add', amount: -5 });
} catch (erro) {
  if (erro.code === 'FORBIDDEN') mostrarAviso('Ficha só de leitura.');
  else console.error(erro.code, erro.message);
}`;

export const FULL_EXAMPLE = `<!-- HTML -->
<h1 id="nome">Ficha</h1>
<p>PV: <span id="pv">–</span></p>
<button id="curar" type="button">+1 PV</button>

// JS
lorkarium.onState((estado) => {
  document.getElementById('nome').textContent = estado.token ? estado.token.name : 'Ficha';
  const pv = lorkarium.bars.get('PV');
  document.getElementById('pv').textContent = pv ? pv.current + ' / ' + pv.max : '–';
  document.getElementById('curar').disabled = !estado.canEdit || !pv;
});
document.getElementById('curar').addEventListener('click', () => {
  lorkarium.bars.adjust('PV', { op: 'add', amount: 1 }).catch((erro) => console.error(erro.code));
});
lorkarium.ready();`;

export const SHEET_LIMITS: readonly string[] = [
  `Código: html + css + js até ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB.`,
  `Valores: até ${SHEET_VALUES_MAX_BYTES / 1024} KiB, ${SHEET_VALUES_MAX_KEYS} chaves (somando as aninhadas) e ${SHEET_VALUES_MAX_DEPTH} níveis.`,
  `Chave de valor: letras sem acento, dígitos, _ ou - (até ${SHEET_VALUE_KEY_MAX_LENGTH}); nunca __proto__, constructor nem prototype.`,
  `Dados: até ${SHEET_DICE_RATE.limit} rolagens a cada ${SHEET_DICE_RATE.windowMs / 1000} s.`,
  'Sem rede: fetch, imagens, fontes e scripts externos são bloqueados. Embuta o que usar (data:).',
  'A ficha roda isolada: não lê a página da mesa, cookies nem armazenamento, e não abre janelas.',
];

/** The titles of the reference's sections, in the order they show (and are copied). */
export const REFERENCE_TITLES = {
  lifecycle: 'Como a ficha conversa com a mesa',
  state: 'O estado',
  calls: 'Funções',
  findBar: 'Como achar a barra',
  values: 'Valores',
  errors: 'Erros',
  fullExample: 'Exemplo completo',
  limits: 'Limites da ficha',
} as const;

export const STATE_INTRO =
  'O objeto que o onState recebe. Chega depois do ready() e de novo a cada mudança.';
export const TOKEN_IMAGE_CAPTION = 'Mostrar o retrato do token num <img id="retrato">:';
export const STATE_TABLE_HEAD = ['Campo', 'O que é'] as const;
export const VALUES_INTRO =
  'Os valores são o que a ficha guarda no servidor (atributos, notas, inventário). Cada ficha tem os seus; todos que veem a ficha recebem os mesmos.';
export const INPUT_BINDING_TITLE = 'Um campo ligado a um valor';
export const ERRORS_INTRO =
  'Quando a mesa recusa, a promessa rejeita com um Error que tem code (abaixo) e message.';
export const ERRORS_TABLE_HEAD = ['code', 'Quando'] as const;
export const CALL_DETAIL_LABELS = {
  params: 'Parâmetros',
  returns: 'Devolve',
  errors: 'Erros',
} as const;
