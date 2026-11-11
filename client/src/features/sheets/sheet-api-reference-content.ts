import {
  ASSET_MAX_BYTES,
  CHARACTER_STAT_MAX,
  DICE_EXPRESSION_MAX_LENGTH,
  DICE_ROLL_LABEL_MAX_LENGTH,
  MAX_BARS_PER_TOKEN,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  SHEET_VALUE_KEY_MAX_LENGTH,
  SHEET_VALUES_MAX_BYTES,
  SHEET_VALUES_MAX_DEPTH,
  SHEET_VALUES_MAX_KEYS,
} from '@lorkarium/contracts';
import {
  SHEET_ASSET_READ_RATE,
  SHEET_CHARACTER_RATE,
  SHEET_DICE_RATE,
  SHEET_DOCUMENT_READ_RATE,
  SHEET_UPLOAD_RATE,
} from '@/sheet-sandbox/sheet-bridge-host';
import { SHEET_VALUES_BATCH_MS } from '@/stores/sheet-store';
import { DOCUMENT_SDK_CALLS } from './sheet-api-reference-documents';
import { SHEET_READY_TIMEOUT_MS } from './sheet-sandbox-view';

export { SHEET_ERROR_CODES } from './sheet-api-reference-errors';

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
  [
    'character',
    'O personagem dono da ficha: { name, armorClass, difficultyClass } (CA e CD, número ou null). É null numa ficha de token solto ou sem dono. Muda quando alguém mexe no personagem.',
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
    signature: 'lorkarium.values.patch([{ path, value }])',
    summary: `Troca só o valor num caminho de chaves, sem reescrever o resto da árvore: editar a habilidade 2 não apaga a 5. Os objetos do caminho são criados se faltarem; null apaga só aquele ponto. Vai no mesmo envio de ${SHEET_VALUES_BATCH_MS} ms do values.set.`,
    params: [
      [
        'path',
        `lista de 1 a ${SHEET_VALUES_MAX_DEPTH} chaves, como ['habilidades', 'k3f9', 'efeito']`,
      ],
      ['value', 'o valor JSON a gravar ali, ou null para apagar'],
    ],
    returns: 'Promessa que resolve quando o servidor salvou.',
    errors: ['FORBIDDEN', 'OFFLINE', 'INVALID_MESSAGE'],
    example:
      "await lorkarium.values.patch([{ path: ['habilidades', 'k3f9', 'efeito'], value: 'Cura 2d8' }]);",
  },
  {
    signature: 'lorkarium.lists.add(lista, item?)',
    summary:
      'Cria um item numa lista repetível (habilidades, itens) com um id novo de 8 letras e dígitos, que nunca muda: editar ou apagar um item não mexe nos outros. Grava por values.patch. A ordem das chaves não é garantida: para ordenar, guarde um campo no item.',
    params: [
      ['lista', "o caminho da lista com pontos, como 'habilidades' ou 'inventario.itens'"],
      ['item', 'opcional: o objeto do item ({} se faltar)'],
    ],
    returns: 'Promessa que resolve com o id do item quando o servidor salvou.',
    errors: ['FORBIDDEN', 'OFFLINE', 'INVALID_MESSAGE', 'TypeError (caminho ou item inválido)'],
    example: "const id = await lorkarium.lists.add('habilidades', { nome: 'Golpe', custo: 2 });",
  },
  {
    signature: 'lorkarium.lists.remove(lista, id)',
    summary: 'Apaga só aquele item da lista; os outros ficam.',
    params: [
      ['lista', "o caminho da lista, como 'habilidades'"],
      ['id', 'o id que o lists.add devolveu'],
    ],
    returns: 'Promessa que resolve quando o servidor salvou.',
    errors: ['FORBIDDEN', 'OFFLINE', 'TypeError (caminho ou id inválido)'],
    example: "await lorkarium.lists.remove('habilidades', id);",
  },
  {
    signature: 'lorkarium.lists.items(lista)',
    summary:
      'Lê os itens da lista no último estado, sem perguntar à mesa. Cada um vem com o id e uma cópia do que guarda.',
    params: [['lista', "o caminho da lista, como 'habilidades'"]],
    returns: 'Lista de { id, value } ([] se o caminho não guarda uma lista).',
    errors: ['TypeError se o caminho é inválido'],
    example: `for (const { id, value } of lorkarium.lists.items('habilidades')) {
  console.log(id, value.nome);
}`,
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
    signature: 'lorkarium.bars.spend([{ bar, amount }])',
    summary: `Paga um custo de várias barras de uma vez, tudo ou nada: se uma não tem saldo, nenhuma muda. Só o valor atual paga (o temporário não). A mesma barra repetida soma os custos. Até ${MAX_BARS_PER_TOKEN} custos.`,
    params: [
      ['bar', 'o nome da barra ("MP") ou o id dela'],
      ['amount', 'quanto tirar: inteiro maior que zero'],
    ],
    returns: 'Promessa que resolve quando o servidor debitou.',
    errors: [
      'INSUFFICIENT_BAR',
      'FORBIDDEN',
      'NO_TOKEN',
      'BAR_NOT_FOUND',
      'BAR_AMBIGUOUS',
      'OFFLINE',
    ],
    example: `try {
  await lorkarium.bars.spend([{ bar: 'MP', amount: 6 }, { bar: 'EF', amount: 6 }]);
} catch (erro) {
  if (erro.code === 'INSUFFICIENT_BAR') console.warn(erro.message);
}`,
  },
  {
    signature: 'lorkarium.bars.create({ label, max, color? })',
    summary: `Cria no dono da ficha uma barra que ele ainda não tem, cheia (atual = máximo), depois das dele, até ${MAX_BARS_PER_TOKEN} barras. Se já existe uma com esse nome (sem diferença de maiúsculas e acentos), nada muda e volta o id dela. Exige a permissão character:bars no manifesto: o jogador não cria barra à mão, e o mestre aprova a permissão ao importar o modelo.`,
    params: [
      ['label', 'o nome da barra, como "Fôlego" (até 24 caracteres)'],
      ['max', 'o máximo: inteiro maior que zero'],
      ['color', "opcional: 'gold' (padrão), 'steel', 'ember', 'moss' ou 'ash'"],
    ],
    returns:
      'Promessa que resolve com { barId, created }: o id da barra e se este pedido a criou (false = ela já existia). O estado novo chega em seguida.',
    errors: [
      'PERMISSION_NOT_DECLARED',
      'BAR_LIMIT',
      'FORBIDDEN',
      'SHEET_HAS_NO_TOKEN',
      'RATE_LIMITED',
      'OFFLINE',
    ],
    example: `const { created } = await lorkarium.bars.create({ label: 'Fôlego', max: 6 });
if (created) console.info('O personagem ganhou a barra Fôlego');`,
  },
  {
    signature: 'lorkarium.dice.roll({ expression, label?, visibility? })',
    summary: `Rola os dados 3D para a mesa. O rótulo sai como "<nome do modelo> · <label>" (até ${DICE_ROLL_LABEL_MAX_LENGTH} caracteres). visibility: 'public' (padrão, todos veem) ou 'masters' (só os mestres). O resultado aparece no histórico de dados e volta para a ficha quando os dados param na mesa.`,
    params: [
      ['expression', `a notação, como "1d20+5" (até ${DICE_EXPRESSION_MAX_LENGTH} caracteres)`],
      ['label', 'opcional: o nome da rolagem, como "Ataque"'],
      ['visibility', "opcional: 'public' ou 'masters'"],
    ],
    returns:
      "Promessa que resolve, quando os dados param, com { expression, total, dice }: a notação rolada, o total e cada dado na ordem do lançamento como { sides, value, status } (status 'kept' ou 'exploded' contam no total; 'dropped' e 'rerolled' não), com success (true/false) só no dado contado contra um alvo (>=, <=).",
    errors: ['INVALID_DICE_EXPRESSION', 'RATE_LIMITED', 'PREVIEW_ONLY', 'OFFLINE'],
    example: `const rolagem = await lorkarium.dice.roll({ expression: '1d20+5', label: 'Ataque' });
const d20 = rolagem.dice[0].value;
const texto = d20 === 20 ? rolagem.total + ' (crítico!)' : String(rolagem.total);
document.getElementById('ataque').textContent = texto;`,
  },
  {
    signature: 'lorkarium.html.sanitize(html)',
    summary:
      'Limpa o HTML de um texto rico antes de mostrar com innerHTML. Ficam p, br, hr, strong, b, em, i, u, s, span, blockquote, ul, ol, li, h1 a h6 e img só com src blob: ou data:image/; div vira p; no style só color e text-align. Somem script, style, iframe, svg e tudo que eles têm, todo atributo de evento (onclick…), links e qualquer outro atributo; uma tag desconhecida some e o texto fica. Mesmo sem limpar, a ficha não executa script vindo dos dados; limpar mantém a formatação previsível.',
    params: [['html', 'o texto com HTML, como o que um campo de texto rico guardou']],
    returns: 'O HTML limpo, na hora (não é promessa nem fala com a mesa).',
    errors: ['TypeError se html não é texto'],
    example: `const descricao = lorkarium.values.get('descricao') ?? '';
document.getElementById('descricao').innerHTML = lorkarium.html.sanitize(descricao);`,
  },
  {
    signature: 'lorkarium.character.get()',
    summary:
      'Lê o personagem do último estado (nome, CA e CD), sem perguntar à mesa. Devolve uma cópia.',
    params: [],
    returns:
      'O personagem, ou null numa ficha que não é de personagem (ou antes do primeiro estado).',
    errors: [],
    example: "const ca = lorkarium.character.get()?.armorClass ?? '–';",
  },
  {
    signature: 'lorkarium.character.set({ armorClass?, difficultyClass? })',
    summary: `Grava a CA e/ou a CD no personagem dono da ficha, para toda a mesa. O mesmo valor que ele já tem não envia nada. Exige "character:stats" no manifesto. Até ${SHEET_CHARACTER_RATE.limit} gravações a cada ${SHEET_CHARACTER_RATE.windowMs / 1000} s.`,
    params: [
      ['armorClass', `opcional: inteiro de 0 a ${CHARACTER_STAT_MAX}`],
      ['difficultyClass', `opcional: inteiro de 0 a ${CHARACTER_STAT_MAX}`],
    ],
    returns: 'Promessa que resolve quando a mesa gravou. O estado novo chega em seguida.',
    errors: ['PERMISSION_NOT_DECLARED', 'FORBIDDEN', 'NO_CHARACTER', 'RATE_LIMITED', 'OFFLINE'],
    example: 'await lorkarium.character.set({ armorClass: 14, difficultyClass: 12 });',
  },
  {
    signature: 'lorkarium.character.setImage(imagem)',
    summary:
      'Troca o retrato do personagem (e dos tokens ligados a ele) por uma imagem: um File de um <input type="file">, um Blob ou { type, bytes }. PNG, JPEG ou WebP. Exige "character:portrait" no manifesto.',
    params: [['imagem', 'File | Blob | { type, bytes } (bytes: ArrayBuffer ou Uint8Array)']],
    returns: 'Promessa que resolve quando o retrato foi trocado.',
    errors: [
      'PERMISSION_NOT_DECLARED',
      'FORBIDDEN',
      'NO_CHARACTER',
      'TOO_LARGE',
      'UNSUPPORTED_IMAGE',
      'RATE_LIMITED',
    ],
    example: `document.getElementById('foto').addEventListener('change', (evento) => {
  const arquivo = evento.target.files[0];
  if (arquivo) lorkarium.character.setImage(arquivo).catch((erro) => console.error(erro.code));
});`,
  },
  {
    signature: 'lorkarium.assets.upload(imagem)',
    summary: `Envia uma imagem para esta ficha (até ${ASSET_MAX_BYTES / 1024 / 1024} MiB; PNG, JPEG ou WebP) e devolve o id dela, para guardar nos valores. Quem lê a ficha lê a imagem. Exige "sheet:images" no manifesto. Até ${SHEET_UPLOAD_RATE.limit} envios a cada ${SHEET_UPLOAD_RATE.windowMs / 1000} s (somando os retratos).`,
    params: [
      [
        'imagem',
        'File | Blob | { type, bytes } — de um <input type="file">, de colar ou de arrastar',
      ],
    ],
    returns: 'Promessa que resolve com { assetId }.',
    errors: [
      'PERMISSION_NOT_DECLARED',
      'FORBIDDEN',
      'TOO_LARGE',
      'UNSUPPORTED_IMAGE',
      'RATE_LIMITED',
    ],
    example: `const { assetId } = await lorkarium.assets.upload(arquivo);
await lorkarium.values.patch([{ path: ['habilidades', 'k3f9', 'imagem'], value: assetId }]);`,
  },
  {
    signature: 'lorkarium.assets.read(assetId)',
    summary: `Lê os bytes de uma imagem pelo id (a ficha não acessa a rede). Mostre por um blob:, como o retrato. Exige "sheet:images" no manifesto. Até ${SHEET_ASSET_READ_RATE.limit} leituras a cada ${SHEET_ASSET_READ_RATE.windowMs / 1000} s.`,
    params: [['assetId', 'o id que o assets.upload devolveu']],
    returns: 'Promessa que resolve com { type, bytes }.',
    errors: ['PERMISSION_NOT_DECLARED', 'ASSET_NOT_FOUND', 'RATE_LIMITED', 'OFFLINE'],
    example: `const imagem = await lorkarium.assets.read(assetId);
img.src = URL.createObjectURL(new Blob([imagem.bytes], { type: imagem.type }));`,
  },
  ...DOCUMENT_SDK_CALLS,
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

export const INPUT_BINDING_EXAMPLE = `<!-- HTML: data-lk="caminho" carrega e grava sozinho, por values.patch -->
<input type="number" data-lk="atributos.forca.base">
<input type="checkbox" data-lk="pericias.atletismo">
<select data-lk="classe"><option>guerreiro</option><option>mago</option></select>
<div contenteditable="true" data-lk="notas"></div>   <!-- grava o HTML limpo por html.sanitize -->
<span data-lk="atributos.forca.total"></span>        <!-- outro elemento só mostra o valor -->

<!-- data-lk-roll troca cada @caminho pelo número guardado e rola -->
<button data-lk-roll="1d20+@atributos.forca.total" data-lk-label="Força">Força</button>
<button data-lk-roll="1d8+@{golpe-duplo.dano}" data-lk-visibility="masters">Golpe</button>

<!-- Regras:
  - caminho de 1 a 8 chaves separadas por ponto; um inválido vai ao console com o elemento,
    e os outros campos seguem ligados;
  - o campo em que alguém digita não é sobrescrito pelo estado novo;
  - número vazio apaga o valor; checkbox grava true/false; só leitura (canEdit: false) não grava;
  - no data-lk-roll o valor precisa ser inteiro; se faltar, a rolagem não sai e o console diz
    qual @caminho; chave com hífen vai entre chaves. -->

// JS: um elemento criado depois (um item de lista) se liga sozinho.
lorkarium.lists.add('habilidades', { nome: 'Golpe' }).then((id) => {
  const campo = document.createElement('input');
  campo.setAttribute('data-lk', 'habilidades.' + id + '.nome');
  document.getElementById('habilidades').append(campo);
});
lorkarium.ready();`;

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
  `Código: todos os arquivos juntos até ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB.`,
  'Arquivos: index.html é a página; <lk-include src="paginas/perfil.html"></lk-include> põe outra página no lugar (até 8 níveis). O CSS e o JS rodam na ordem da lista de arquivos, cada JS no seu próprio <script>.',
  'Fontes e imagens: envie na aba Manifesto e use url("asset:fontes/x.woff2") no CSS ou src="asset:img/a.png" no HTML; viram data: ao montar (até 8 MiB juntos, fonte WOFF2 até 2 MiB).',
  `Valores: até ${SHEET_VALUES_MAX_BYTES / 1024} KiB, ${SHEET_VALUES_MAX_KEYS} chaves (somando as aninhadas) e ${SHEET_VALUES_MAX_DEPTH} níveis.`,
  `Chave de valor: letras sem acento, dígitos, _ ou - (até ${SHEET_VALUE_KEY_MAX_LENGTH}); nunca __proto__, constructor nem prototype.`,
  `Dados: até ${SHEET_DICE_RATE.limit} rolagens a cada ${SHEET_DICE_RATE.windowMs / 1000} s.`,
  `Documentos: só os públicos, fora de pastas ocultas, e as abas que não são só do mestre; até ${SHEET_DOCUMENT_READ_RATE.limit} leituras a cada ${SHEET_DOCUMENT_READ_RATE.windowMs / 1000} s.`,
  'Sem rede: fetch, imagens, fontes e scripts externos são bloqueados. Embuta o que usar (data:).',
  'A ficha roda isolada: não lê a página da mesa, cookies nem armazenamento, e não abre janelas.',
  'Script só nos arquivos .js: <script> escrito no HTML, atributos de evento (onclick, onerror…) e links javascript: não rodam, nem no HTML do modelo nem no que vier dos valores. Ligue eventos com addEventListener no JS; ao salvar, o editor avisa a linha de cada atributo que não vai rodar.',
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
export const INPUT_BINDING_TITLE = 'Campos ligados a valores (data-lk)';
export const ERRORS_INTRO =
  'Quando a mesa recusa, a promessa rejeita com um Error que tem code (abaixo) e message.';
export const ERRORS_TABLE_HEAD = ['code', 'Quando'] as const;
export const CALL_DETAIL_LABELS = {
  params: 'Parâmetros',
  returns: 'Devolve',
  errors: 'Erros',
} as const;
