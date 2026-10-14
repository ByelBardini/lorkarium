// O papel de cada arquivo está no sufixo do nome (AGENTS.md, "Camadas do
// server"), com o vocabulário de PO, BO, DTO e VO do artigo da DevMedia
// (https://www.devmedia.com.br/diferenca-entre-os-patterns-po-pojo-bo-dto-e-vo/28162).
// Aqui mora o que cada camada promete **por si mesma**: PO sem lógica, BO e
// mapper sem I/O, porta só de tipos, borda que valida pelo DTO, DTO no
// contracts e VO no game-core. Direção de import fica em dependencias.mjs;
// regra transversal, em contrato.mjs.
import { achado } from '../../refatorar/lib/achados.mjs';
import { linhaDe } from '../../refatorar/lib/ast.mjs';
import { linhaDaOcorrencia, linhaDoPadrao } from './texto.mjs';

// Ordem importa: o primeiro sufixo que casar decide a camada.
const SUFIXOS = [
  ['.routes.ts', 'routes'],
  ['.gateway.ts', 'gateway'],
  ['.plugin.ts', 'plugin'],
  ['.service.ts', 'service'],
  ['.dao.ts', 'dao'],
  ['.bo.ts', 'bo'],
  ['.mapper.ts', 'mapper'],
  ['.po.ts', 'po'],
  ['.port.ts', 'port'],
  ['.error.ts', 'error'],
  ['.dto.ts', 'dto'],
  ['.vo.ts', 'vo'],
];

// Consulta Drizzle de verdade, sobre o texto **sem comentários**: a docstring
// com `Example:` traz código, e procurar no texto cru acusa o exemplo.
// `transaction` fica de fora: quem abre a transação é o encanamento de
// src/database/, e isso é pergunta de arquitetura, não consulta.
export const CONSULTA_AO_BANCO =
  /\b(?:this\.)?(?:db|tx|database|trx)\s*\.\s*(?:select|selectDistinct|insert|update|delete|execute|query|with|\$count)\b/;

const PASTAS_DE_ENCANAMENTO = /^src\/(database|realtime|infrastructure|app|config|lib)\//;
const SEM_BANCO = new Set([
  'routes',
  'gateway',
  'plugin',
  'service',
  'bo',
  'mapper',
  'po',
  'port',
  'error',
]);
const PURAS = new Map([
  ['bo', 'regra de negócio (BO)'],
  ['mapper', 'conversão entre PO, BO e DTO'],
  ['vo', 'valor (VO)'],
  ['core', 'regra de jogo do game-core'],
]);
const RELOGIO_OU_SORTEIO =
  /\bDate\.now\(|\bnew Date\(\s*\)|\bMath\.random\(|\bcrypto\.randomUUID\(/;

/** A camada de um arquivo pelo sufixo do nome, ou `null` quando ele não
 *  declara papel nenhum (`turn-cycle.ts`, `env.ts`).
 *
 *  Example: `camadaDe('src/modules/combat/combat.dao.ts') // 'dao'` */
export function camadaDe(relativo) {
  const par = SUFIXOS.find(([sufixo]) => relativo.endsWith(sufixo));
  return par ? par[1] : null;
}

/** A camada de uma ficha de qualquer workspace: todo arquivo do contracts é
 *  DTO, e o game-core é VO (`*.vo.ts`) ou regra de jogo (`core`).
 *
 *  Example: `camadaDaFicha(fichaDoContracts) // 'dto'` */
export function camadaDaFicha(ficha) {
  if (ficha.workspace.tipo === 'contracts') return 'dto';
  if (ficha.workspace.tipo === 'game-core')
    return camadaDe(ficha.relativo) === 'vo' ? 'vo' : 'core';
  return camadaDe(ficha.relativo);
}

export function analisarCamadas(contexto) {
  return contexto.doAlvo.flatMap((ficha) => regrasDaFicha(contexto, ficha));
}

function regrasDaFicha(contexto, ficha) {
  const tipo = ficha.workspace.tipo;
  if (tipo === 'contracts') return regrasDoDto(ficha);
  if (tipo === 'game-core')
    return camadaDe(ficha.relativo) === 'vo'
      ? regrasDoVo(contexto, ficha)
      : regraPura(ficha, 'core');
  const camada = camadaDe(ficha.relativo);
  if (camada === null) return [];
  return [
    ...consultaForaDoDao(ficha, camada),
    ...regraPura(ficha, camada),
    ...(REGRAS_POR_CAMADA[camada] ?? (() => []))(contexto, ficha),
    ...adaptadorForaDaInfraestrutura(ficha),
    ...schemaForaDoContracts(ficha),
  ];
}

function consultaForaDoDao(ficha, camada) {
  if (!SEM_BANCO.has(camada) || PASTAS_DE_ENCANAMENTO.test(ficha.relativo)) return [];
  const linha = linhaDoPadrao(ficha, CONSULTA_AO_BANCO);
  if (linha === null) return [];
  return [
    achado(
      'camadas',
      'consulta-fora-do-dao',
      'erro',
      ficha,
      linha,
      `${ficha.nome} é ${camada} e consulta o banco: quem consulta é o DAO, e ele devolve PO`,
      'mova a query para um *.dao.ts do módulo (que recebe o db/tx pelo construtor) e deixe aqui só o que se faz com o resultado',
    ),
  ];
}

// BO, mapper e VO não esperam nada: `async`/`await` é I/O, e relógio ou sorteio
// tornam a decisão irrepetível (o teste deixa de provar a regra).
function regraPura(ficha, camada) {
  const papel = PURAS.get(camada);
  if (papel === undefined) return [];
  const achados = [];
  const linhaDeIo = linhaDoPadrao(ficha, /\b(?:async|await)\b/);
  if (linhaDeIo !== null) {
    achados.push(
      achado(
        'camadas',
        'camada-pura-com-io',
        'erro',
        ficha,
        linhaDeIo,
        `${ficha.nome} é ${papel} e espera I/O (async/await)`,
        'receba o dado pronto por parâmetro; quem busca e grava é o service, pelo DAO ou por uma porta',
      ),
    );
  }
  const linhaDoRelogio = linhaDoPadrao(ficha, RELOGIO_OU_SORTEIO);
  if (linhaDoRelogio !== null) {
    achados.push(
      achado(
        'camadas',
        'camada-pura-com-relogio',
        'aviso',
        ficha,
        linhaDoRelogio,
        `${ficha.nome} é ${papel} e lê relógio ou sorteio por conta própria`,
        'receba o instante, o id ou o resultado do sorteio por parâmetro (o service pega da porta Clock/IdGenerator)',
      ),
    );
  }
  return achados;
}

const REGRAS_POR_CAMADA = {
  po: regrasDoPo,
  port: regrasDaPorta,
  routes: regrasDaBorda,
  gateway: regrasDaBorda,
  dto: dtoForaDoContracts,
  vo: voForaDoGameCore,
};

// PO (Persistent Object): a linha como o banco a guarda — a tabela do Drizzle
// e os tipos `$inferSelect`/`$inferInsert`. Sem regra e sem transação.
function regrasDoPo(contexto, ficha) {
  const funcoes = ficha.exports.filter((item) => item.tipo === 'function' || item.tipo === 'class');
  return funcoes.map((item) =>
    achado(
      'camadas',
      'po-com-logica',
      'erro',
      ficha,
      item.linha,
      `${ficha.nome} é PO e exporta \`${item.nome}\` (${item.tipo === 'class' ? 'classe' : 'função'})`,
      'o PO é só a tabela e os tipos inferidos; a regra vai para o BO, a conversão para o mapper e a consulta para o DAO',
    ),
  );
}

function regrasDaPorta(contexto, ficha) {
  const achados = [];
  const lib = ficha.imports.find((item) => ehPacoteDeTerceiro(item.especificador) && !item.ehTipo);
  if (lib !== undefined) {
    achados.push(
      achado(
        'camadas',
        'porta-com-lib-de-terceiro',
        'erro',
        ficha,
        lib.linha,
        `a porta ${ficha.nome} importa ${lib.especificador}: a porta é o contrato do projeto, a lib mora no adaptador`,
        'deixe o import da lib só no adaptador em src/infrastructure/, que implementa a porta',
      ),
    );
  }
  const implementacao =
    ficha.funcoes.find((funcao) => funcao.nome) ??
    ficha.exports.find((item) => item.tipo === 'const' || item.tipo === 'class');
  if (implementacao !== undefined) {
    achados.push(
      achado(
        'camadas',
        'porta-com-implementacao',
        'aviso',
        ficha,
        implementacao.linha,
        `${ficha.nome} traz implementação (\`${implementacao.nome}\`): porta é só o contrato`,
        'declare `export interface XPort { … }` aqui e a implementação num adaptador em src/infrastructure/ (o fake fica em test/support/)',
      ),
    );
  }
  return achados;
}

// spec §5.4 e §7.3: a borda valida o comando pelo DTO compartilhado com o
// client antes de qualquer coisa.
function regrasDaBorda(contexto, ficha) {
  const usaContracts = ficha.imports.some((item) => {
    const destino = item.resolvido ? contexto.fichas.get(item.resolvido) : null;
    return destino?.workspace.tipo === 'contracts' || /\/contracts$/.test(item.especificador);
  });
  if (usaContracts) return [];
  return [
    achado(
      'camadas',
      'borda-sem-dto',
      'aviso',
      ficha,
      1,
      `${ficha.nome} é borda (${camadaDe(ficha.relativo)}) e não importa nada de packages/contracts`,
      'valide body, params e payload do evento pelo DTO de contracts (`dto.parse(...)`) antes de chamar o service',
    ),
  ];
}

function dtoForaDoContracts(contexto, ficha) {
  return [
    achado(
      'camadas',
      'dto-fora-do-contracts',
      'erro',
      ficha,
      1,
      `${ficha.nome} é DTO e mora no server: DTO é o que atravessa client↔server`,
      'mova para packages/contracts/src/<área>/ e importe de `@lorkarium/contracts` dos dois lados',
    ),
  ];
}

function voForaDoGameCore(contexto, ficha) {
  return [
    achado(
      'camadas',
      'vo-fora-do-game-core',
      'erro',
      ficha,
      1,
      `${ficha.nome} é VO e mora fora do game-core`,
      'mova para packages/game-core/src/: o VO é o valor do domínio que server e client usam igual',
    ),
  ];
}

function schemaForaDoContracts(ficha) {
  if (!ficha.relativo.startsWith('src/modules/')) return [];
  const linha = linhaDaOcorrencia(ficha, /\bz\s*\.\s*(?:strictObject|object|looseObject)\(/);
  if (linha === null) return [];
  return [
    achado(
      'camadas',
      'schema-fora-do-contracts',
      'aviso',
      ficha,
      linha,
      `${ficha.nome} declara schema Zod dentro do módulo`,
      'forma de entrada/saída é DTO e mora em packages/contracts; schema só do server (env) mora em src/config/',
    ),
  ];
}

function adaptadorForaDaInfraestrutura(ficha) {
  if (ficha.relativo.startsWith('src/infrastructure/')) return [];
  return ficha.classes
    .filter((classe) => classe.implementa.some((nome) => /Port$/.test(nome)))
    .map((classe) =>
      achado(
        'camadas',
        'adaptador-fora-da-infraestrutura',
        'aviso',
        ficha,
        classe.linha,
        `${classe.nome} implementa ${classe.implementa.join(', ')} fora de src/infrastructure/`,
        'adaptador de porta mora em src/infrastructure/<porta>/; o fake de teste, em test/support/',
      ),
    );
}

// DTO (Data Transfer Object): transfere dado entre client e server, sem regra
// de negócio. Schema Zod + tipo inferido, e estrito: comando que aceita campo
// extra aceita identidade forjada (spec §7.3).
function regrasDoDto(ficha) {
  const achados = [];
  if (!ficha.imports.some((item) => item.especificador === 'zod') && !ficha.ehEntradaDoPacote) {
    achados.push(
      achado(
        'camadas',
        'dto-sem-zod',
        'aviso',
        ficha,
        1,
        `${ficha.nome} não usa Zod: o DTO é validado nos dois lados pelo mesmo schema`,
        'declare `export const xDto = z.strictObject({...})` e `export type XDto = z.infer<typeof xDto>`',
      ),
    );
  }
  for (const item of ficha.exports.filter((exportado) => exportado.tipo === 'function')) {
    achados.push(
      achado(
        'camadas',
        'dto-com-logica',
        'aviso',
        ficha,
        item.linha,
        `${ficha.nome} exporta a função \`${item.nome}\`: DTO não carrega regra de negócio`,
        'regra de jogo vai para o game-core; decisão do server, para o BO do módulo',
      ),
    );
  }
  const frouxo = linhaDaOcorrencia(ficha, /\bz\s*\.\s*object\(/);
  if (frouxo !== null) {
    achados.push(
      achado(
        'camadas',
        'dto-frouxo',
        'info',
        ficha,
        frouxo,
        '`z.object(` aceita e descarta campo desconhecido em silêncio',
        'use `z.strictObject(` em comando e payload de entrada: campo extra vira 400, não passa despercebido',
      ),
    );
  }
  return achados;
}

// VO (Value Object): valor pequeno, imutável, comparado pelo valor e sem
// identidade; nasce por um construtor que recusa citando o valor recebido.
function regrasDoVo(contexto, ficha) {
  return [
    ...voMutavel(contexto, ficha),
    ...voComIdentidade(contexto, ficha),
    ...voSemConstrutor(ficha),
    ...regraPura(ficha, 'vo'),
  ];
}

function voMutavel(contexto, ficha) {
  const { ts } = contexto;
  const achados = [];
  for (const classe of ficha.classes) {
    const mutavel = classe.membros.find(
      (membro) => (membro.ehPropriedade && !membro.somenteLeitura) || membro.ehSetter,
    );
    if (mutavel)
      achados.push(
        achado(
          'camadas',
          'vo-mutavel',
          'aviso',
          ficha,
          mutavel.linha,
          `${classe.nome}.${mutavel.nome} pode ser reatribuído`,
          'VO é imutável: `readonly` em todo campo; "mudar" é criar outro valor',
        ),
      );
  }
  const visita = (no) => {
    const membros = membrosDeTipo(ts, no);
    const solto = membros?.find(
      (membro) =>
        ts.isPropertySignature(membro) &&
        !(ts.getModifiers(membro) ?? []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword),
    );
    if (solto)
      achados.push(
        achado(
          'camadas',
          'vo-mutavel',
          'aviso',
          ficha,
          linhaDe(ficha.fonte, solto.getStart(ficha.fonte)),
          `${no.name.text}.${solto.name.getText(ficha.fonte)} não é readonly`,
          'declare `Readonly<{ ... }>` ou `readonly` em cada campo',
        ),
      );
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

// `type X = { a: number }` e `interface X { a: number }` expõem os membros;
// `Readonly<{ ... }>` não (é referência de tipo), e é o jeito certo.
function membrosDeTipo(ts, no) {
  if (ts.isInterfaceDeclaration(no)) return no.members;
  if (ts.isTypeAliasDeclaration(no) && ts.isTypeLiteralNode(no.type)) return no.type.members;
  return null;
}

function voComIdentidade(contexto, ficha) {
  const linha = linhaDoPadrao(ficha, /^\s*(?:readonly\s+)?id\??\s*:/);
  if (linha === null) return [];
  return [
    achado(
      'camadas',
      'vo-com-identidade',
      'aviso',
      ficha,
      linha,
      `${ficha.nome} tem campo \`id\`: VO é comparado pelo valor, não pela identidade`,
      'o que tem id é entidade (PO no banco, BO na regra); o VO é o valor que ela carrega (posição, HP, iniciativa)',
    ),
  ];
}

function voSemConstrutor(ficha) {
  const temConstrutor = ficha.exports.some(
    (item) => item.tipo === 'function' || item.tipo === 'class',
  );
  if (temConstrutor) return [];
  return [
    achado(
      'camadas',
      'vo-sem-construtor',
      'erro',
      ficha,
      1,
      `${ficha.nome} declara o VO sem exportar construtor: o único jeito de criar o valor é o literal ou o \`as\`, que pulam a validação`,
      'exporte a função (ou classe) que recusa citando o valor recebido e a forma esperada',
    ),
  ];
}

function ehPacoteDeTerceiro(especificador) {
  return (
    !especificador.startsWith('.') &&
    !especificador.startsWith('node:') &&
    !especificador.startsWith('@lorkarium/')
  );
}
