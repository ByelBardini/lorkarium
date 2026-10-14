// A direção dos imports entre camadas. O fluxo é fixo: a borda (routes,
// gateway) valida o DTO e chama o service; o service orquestra DAO, porta e
// BO; o DAO devolve PO; o mapper converte PO → BO → DTO. Uma seta ao
// contrário (o DAO que devolve DTO, o BO que busca o que devia receber) é o
// que transforma camada em enfeite, então cada uma é achado com os dois
// lados citados.
import { achado } from '../../refatorar/lib/achados.mjs';
import { regrasDoGameCore } from '../../refatorar/lib/arquitetura.mjs';
import { camadaDaFicha, camadaDe } from './camadas.mjs';

// Encanamento sobre o qual as camadas são construídas: db, transação, servidor
// Socket.IO, adaptadores, env e util genérico. Ficam fora da matriz.
const ENCANAMENTO = /^src\/(database|realtime|infrastructure|config|lib|app)\//;
const BORDAS = ['routes', 'gateway', 'plugin'];

// origem → [destino, severidade, porquê]. Só import de **valor**; `import
// type` não acopla em runtime — exceto para o DTO (ver `daTipo`).
const PROIBIDOS = {
  service: BORDAS.map((borda) => [
    borda,
    'erro',
    'quem chama o service é a borda, nunca o contrário',
  ]),
  dao: [
    ...BORDAS.map((borda) => [
      borda,
      'erro',
      'o DAO é a ponta de baixo: não conhece HTTP nem evento',
    ]),
    ['service', 'aviso', 'orquestração é do service; DAO que chama service inverte a pilha'],
    ['bo', 'aviso', 'o DAO devolve PO; a regra é aplicada pelo BO depois, no service'],
    [
      'mapper',
      'aviso',
      'o DAO devolve PO; converter é papel do mapper, chamado pelo service ou pela borda',
    ],
    ['dto', 'aviso', 'o DAO fala PO; DTO é a borda, e quem converte é o mapper'],
  ],
  bo: [
    ...BORDAS.map((borda) => [
      borda,
      'erro',
      'BO é regra de negócio: não conhece rota, evento nem status',
    ]),
    [
      'service',
      'aviso',
      'o BO recebe dado pronto e devolve decisão; quem junta as fontes é o service',
    ],
    [
      'dao',
      'aviso',
      'BO que importa DAO busca o que devia receber (o PO já lido, convertido pelo mapper)',
    ],
    ['port', 'aviso', 'porta é I/O: quem a usa é o service, não a regra'],
    [
      'mapper',
      'aviso',
      'o mapper constrói o BO a partir do PO; BO que importa mapper inverte a conversão',
    ],
    ['dto', 'aviso', 'o BO decide sobre PO e VO; DTO é forma de transferência da borda'],
  ],
  mapper: [
    ...BORDAS.map((borda) => [borda, 'erro', 'o mapper é chamado pela borda, não o contrário']),
    ['service', 'aviso', 'o mapper converte; ele não orquestra'],
    [
      'dao',
      'aviso',
      'o mapper recebe o PO por parâmetro; importar o DAO acopla a conversão à query',
    ],
  ],
  po: [
    ...[...BORDAS, 'service', 'dao', 'bo', 'mapper', 'port', 'dto'].map((destino) => [
      destino,
      'erro',
      'o PO só conhece o Drizzle e outro PO (chave estrangeira)',
    ]),
  ],
  port: [
    ...[...BORDAS, 'service', 'dao', 'bo', 'mapper'].map((destino) => [
      destino,
      'erro',
      'a porta é o contrato de I/O: ela não conhece nada acima dela',
    ]),
  ],
  routes: [['po', 'aviso', 'a borda fala DTO: o PO não sai do server sem passar pelo mapper']],
  gateway: [['po', 'aviso', 'a borda fala DTO: o PO não sai do server sem passar pelo mapper']],
};

export function analisarDependencias(contexto) {
  return contexto.doAlvo.flatMap((ficha) => {
    if (ficha.workspace.tipo === 'game-core') {
      return regrasDoGameCore(contexto, ficha)
        .filter((item) => item.regra === 'game-core-com-dependencia')
        .map((item) => ({ ...item, categoria: 'dependencias' }));
    }
    if (ficha.workspace.tipo !== 'server') return [];
    return [
      ...setasDaFicha(contexto, ficha),
      ...transversalConheceModulo(contexto, ficha),
      ...bordaDeOutroModulo(contexto, ficha),
    ];
  });
}

function setasDaFicha(contexto, ficha) {
  const origem = camadaDe(ficha.relativo);
  if (origem === null || ENCANAMENTO.test(ficha.relativo)) return [];
  return ficha.imports.flatMap((item) => setaProibida(contexto, ficha, origem, item));
}

function setaProibida(contexto, ficha, origem, item) {
  const destino = item.resolvido ? contexto.fichas.get(item.resolvido) : null;
  if (
    !destino ||
    destino.ehTeste ||
    (destino.workspace === ficha.workspace && ENCANAMENTO.test(destino.relativo))
  )
    return [];
  const camadaDestino = camadaDaFicha(destino);
  if (item.ehTipo && !daTipo(camadaDestino)) return [];
  const regra = (PROIBIDOS[origem] ?? []).find(([alvo]) => alvo === camadaDestino);
  if (regra === undefined) return [];
  const [, severidade, porque] = regra;
  return [
    achado(
      'dependencias',
      'seta-invertida',
      severidade,
      ficha,
      item.linha,
      `${origem} (${ficha.nome}) importa ${camadaDestino} (${destino.nome})${citarNomes(item)}: ${porque}`,
      sugestaoDaSeta(origem, camadaDestino),
    ),
  ];
}

// O tipo do DTO numa assinatura de DAO ou BO já é a seta errada: a função
// passou a devolver (ou decidir sobre) forma de transferência.
function daTipo(camadaDestino) {
  return camadaDestino === 'dto';
}

function citarNomes(item) {
  const nomes = item.nomes.map((nome) => nome.local);
  return nomes.length === 0 ? '' : ` (${nomes.join(', ')})`;
}

function sugestaoDaSeta(origem, destino) {
  if (origem === 'bo' && (destino === 'dao' || destino === 'service' || destino === 'port')) {
    return 'receba o dado por parâmetro: o service lê pelo DAO, o mapper converte o PO em BO, e o BO decide — é o que o deixa testável sem banco';
  }
  if (destino === 'dto') return 'converta no mapper (PO/BO → DTO) e deixe a camada falar PO/BO';
  if (origem === 'mapper' && destino === 'dao')
    return 'troque por `import type` do PO: o mapper precisa do shape da linha, não do repositório';
  return `inverta a dependência: quem conhece ${destino} é quem está acima dele`;
}

// src/config/, src/lib/ e o encanamento são "o que não conhece domínio":
// importar um módulo de feature a partir dali inverte a pasta transversal. As
// duas exceções são estruturais: src/database/ junta os PO no schema do
// Drizzle, e src/app/ registra os plugins.
function transversalConheceModulo(contexto, ficha) {
  const ehTransversal = /^src\/(config|lib|database|realtime|infrastructure)\//.test(
    ficha.relativo,
  );
  if (!ehTransversal) return [];
  return ficha.imports.flatMap((item) => {
    const destino = item.resolvido ? contexto.fichas.get(item.resolvido) : null;
    if (
      !destino ||
      item.ehTipo ||
      destino.workspace !== ficha.workspace ||
      !destino.relativo.startsWith('src/modules/')
    )
      return [];
    if (ficha.relativo.startsWith('src/database/') && destino.nome.endsWith('.po.ts')) return [];
    return [
      achado(
        'dependencias',
        'transversal-conhece-modulo',
        'erro',
        ficha,
        item.linha,
        `${ficha.relativo} importa ${destino.relativo}: a pasta transversal não conhece módulo de feature`,
        'o trecho com domínio volta para o módulo; o genérico desce para src/lib/ sem arrastar a feature',
      ),
    ];
  });
}

// Um módulo pede a outro pelo service; importar a rota, o gateway ou o plugin
// alheio acopla as bordas.
function bordaDeOutroModulo(contexto, ficha) {
  const modulo = ficha.relativo.match(/^src\/modules\/([^/]+)\//)?.[1];
  if (!modulo) return [];
  return ficha.imports.flatMap((item) => {
    const destino = item.resolvido ? contexto.fichas.get(item.resolvido) : null;
    const outro = destino?.relativo.match(/^src\/modules\/([^/]+)\//)?.[1];
    if (!outro || outro === modulo || item.ehTipo || !BORDAS.includes(camadaDe(destino.relativo)))
      return [];
    return [
      achado(
        'dependencias',
        'borda-de-outro-modulo',
        'aviso',
        ficha,
        item.linha,
        `${ficha.nome} importa ${destino.nome} do módulo ${outro}`,
        'peça ao service do módulo dono; rota, gateway e plugin são a borda dele',
      ),
    ];
  });
}
