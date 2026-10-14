// O arquivo está no lugar certo e obedece às regras de arquitetura do
// Lorkarium (docs/spec.md §2 e §5, AGENTS.md)? Regras comuns a todo workspace
// e um bloco por tipo: server (Fastify + Drizzle + Socket.IO), client (React +
// PixiJS + Zustand), game-core (regra de jogo pura) e contracts (DTOs).
import { achado, linhasUteis } from './achados.mjs';
import { linhaDe, medirCorpo } from './ast.mjs';

const CATEGORIA = 'arquitetura';

// Lib de terceiro entra por um lugar só; import de valor fora dele é
// vazamento. `import type` não carrega runtime e não conta.
const ADAPTADORES = {
  server: [
    {
      lib: /^(drizzle-orm|pg)(\/|$)/,
      casas: [/^src\/database\//, /\.po\.ts$/, /\.dao\.ts$/],
      onde: 'src/database/, *.po.ts e *.dao.ts',
    },
    { lib: /^socket\.io$/, casas: [/^src\/realtime\//], onde: 'src/realtime/' },
    {
      lib: /^fastify$/,
      casas: [/^src\/app\//, /^src\/index\.ts$/],
      onde: 'src/app/ e src/index.ts',
    },
    {
      lib: /^pino(-pretty)?$/,
      casas: [/^src\/app\//, /^src\/config\//],
      onde: 'src/app/ e src/config/ (o logger é o do Fastify)',
    },
    {
      lib: /^(@aws-sdk\/|argon2$|sharp$|file-type$|nodemailer$)/,
      casas: [/^src\/infrastructure\//],
      onde: 'src/infrastructure/ (o adaptador de uma porta)',
    },
  ],
  client: [
    { lib: /^(pixi\.js|@pixi\/)/, casas: [/^src\/renderer\//], onde: 'src/renderer/' },
    { lib: /^socket\.io-client$/, casas: [/^src\/services\//], onde: 'src/services/' },
    { lib: /^zustand(\/|$)/, casas: [/^src\/stores\//], onde: 'src/stores/' },
  ],
};

const CONSOLE_PERMITIDO = /^(scripts\/|[^/]+\.config\.[cm]?ts$)/;
const PROCESS_ENV_PERMITIDO = /^(src\/config\/|src\/index\.ts$|scripts\/|[^/]+\.config\.[cm]?ts$)/;
const DEPENDENCIAS_DO_CONTRACTS = new Set(['zod']);
const TETO_DE_LINHAS_DA_ROTA_DO_CLIENT = 100;
const TETO_DE_LINHAS_DO_HANDLER = 20;
const TETO_DE_COMPLEXIDADE_DO_HANDLER = 4;
const TETO_DE_PROFUNDIDADE_DO_HANDLER = 2;
const METODOS_DE_REGISTRO = /^(get|post|put|patch|delete|head|options|all|route|on|once)$/;
const CAMPOS_DE_IDENTIDADE = 'userId|ownerId|memberId|actorId|playerId|requesterId|role';
// `socket.data.userId` é o contrário do achado: é onde o middleware de
// autenticação da conexão guarda quem é o usuário (o lugar certo de ler).
export const IDENTIDADE_LIDA_DO_PAYLOAD = new RegExp(
  `(?<!\\bsocket\\.)\\b(?:body|payload|data|input|command|params|query|dto)\\s*\\.\\s*(?:${CAMPOS_DE_IDENTIDADE})\\b`,
);
export const IDENTIDADE_DESESTRUTURADA = new RegExp(
  `\\{[^}]*\\b(?:${CAMPOS_DE_IDENTIDADE})\\b[^}]*\\}\\s*=\\s*(?:request\\.|req\\.)?(?:body|payload|params|query|command)\\b`,
);

export function analisarArquitetura(contexto) {
  const achados = [];
  for (const ficha of contexto.fichasDoAlvo()) {
    if (ficha.gerado) continue;
    achados.push(...regrasComuns(contexto, ficha));
    if (ficha.ehTeste) continue;
    const regrasDoTipo = REGRAS_POR_TIPO[ficha.workspace.tipo];
    if (regrasDoTipo) achados.push(...regrasDoTipo(contexto, ficha));
  }
  return achados;
}

function regrasComuns(contexto, ficha) {
  const achados = [];
  if (ficha.relativo.startsWith('src/') && /\.(spec|test)\.[cm]?tsx?$/.test(ficha.nome)) {
    achados.push(
      achado(
        CATEGORIA,
        'teste-ao-lado-do-codigo',
        'erro',
        ficha,
        1,
        'spec dentro de src/',
        'mover para test/ espelhando src/',
      ),
    );
  }
  if (ficha.ehTeste) achados.push(...specImportaSrcRelativo(contexto, ficha));
  if (!ficha.ehTeste) achados.push(...libsForaDoAdaptador(ficha), ...consoleEmProducao(ficha));
  achados.push(...importProfundoDeOutroWorkspace(contexto, ficha));
  return achados;
}

// Só cobra quando o workspace tem alias no tsconfig: sem alias, o relativo é o
// único caminho e a correção é configurar o alias (pergunta para o usuário).
function specImportaSrcRelativo(contexto, ficha) {
  const alias = ficha.workspace.aliases[0];
  if (!alias || !ficha.relativo.startsWith('test/')) return [];
  const relativosParaSrc = ficha.imports.filter((importacao) => {
    const destino = importacao.resolvido ? contexto.fichas.get(importacao.resolvido) : null;
    return (
      importacao.especificador.startsWith('.') &&
      destino?.workspace === ficha.workspace &&
      destino.relativo.startsWith('src/')
    );
  });
  return relativosParaSrc.map((importacao) =>
    achado(
      CATEGORIA,
      'spec-importa-src-relativo',
      'aviso',
      ficha,
      importacao.linha,
      `spec importa produção por caminho relativo (${importacao.especificador})`,
      `importar via ${alias.prefixo}...`,
    ),
  );
}

function libsForaDoAdaptador(ficha) {
  const achados = [];
  for (const regra of ADAPTADORES[ficha.workspace.tipo] ?? []) {
    if (regra.casas.some((casa) => casa.test(ficha.relativo))) continue;
    for (const importacao of ficha.imports.filter(
      (i) => !i.ehTipo && regra.lib.test(i.especificador),
    )) {
      achados.push(
        achado(
          CATEGORIA,
          'lib-de-terceiro-fora-do-adaptador',
          'erro',
          ficha,
          importacao.linha,
          `importa \`${importacao.especificador}\` fora de ${regra.onde}`,
          `usar o que ${regra.onde} expõe; a lib só é importada lá`,
        ),
      );
    }
  }
  return achados;
}

function linhasComPadrao(ficha, regex) {
  const linhas = [];
  ficha.textoSemComentarios.split('\n').forEach((linha, indice) => {
    if (regex.test(linha)) linhas.push(indice + 1);
  });
  return linhas;
}

function consoleEmProducao(ficha) {
  if (CONSOLE_PERMITIDO.test(ficha.relativo)) return [];
  const sugestao =
    ficha.workspace.tipo === 'server'
      ? 'o logger do Fastify (request.log / app.log), que já é pino estruturado'
      : 'erro de tela vira estado de erro na UI; log de diagnóstico sai antes do commit';
  return linhasComPadrao(ficha, /\bconsole\.(log|error|warn|info|debug)\(/)
    .slice(0, 3)
    .map((linha) =>
      achado(
        CATEGORIA,
        'console-em-producao',
        'aviso',
        ficha,
        linha,
        '`console.*` em código de produção',
        sugestao,
      ),
    );
}

// `../../packages/game-core/src/grid` ou `@lorkarium/game-core/src/grid`: o
// consumidor passa a depender do arquivo interno, e a entrada do pacote deixa
// de ser o contrato.
function importProfundoDeOutroWorkspace(contexto, ficha) {
  return ficha.imports.flatMap((importacao) => {
    const destino = importacao.resolvido ? contexto.fichas.get(importacao.resolvido) : null;
    if (!destino || destino.workspace === ficha.workspace || destino.ehEntradaDoPacote) return [];
    return [
      achado(
        CATEGORIA,
        'import-profundo-de-outro-workspace',
        'erro',
        ficha,
        importacao.linha,
        `importa ${destino.relativoAoRepo} por dentro do workspace ${destino.workspace.nome}`,
        `importar de \`${destino.workspace.pacote}\` só o que a entrada do pacote exporta`,
      ),
    ];
  });
}

const REGRAS_POR_TIPO = {
  server: regrasDoServer,
  client: regrasDoClient,
  'game-core': regrasDoGameCore,
  contracts: regrasDoContracts,
};

function moduloDe(ficha) {
  return ficha.relativo.match(/^src\/modules\/([^/]+)\//)?.[1] ?? null;
}

function regrasDoServer(contexto, ficha) {
  const achados = [];
  if (!PROCESS_ENV_PERMITIDO.test(ficha.relativo)) {
    for (const linha of linhasComPadrao(ficha, /\bprocess\.env\b/)) {
      achados.push(
        achado(
          CATEGORIA,
          'process-env-direto',
          'erro',
          ficha,
          linha,
          '`process.env` fora do schema de env',
          'ler do objeto validado por Zod em src/config/ (env.ts), recebido por parâmetro',
        ),
      );
    }
  }
  achados.push(
    ...identidadeDoPayload(ficha),
    ...acoplamentoEntreModulos(contexto, ficha),
    ...handlerComLogica(contexto, ficha),
  );
  return achados;
}

// spec §7.3: "a identidade do usuário será obtida da conexão autenticada,
// nunca de um identificador arbitrário declarado no payload".
function identidadeDoPayload(ficha) {
  if (!/^src\/(modules|realtime|app)\//.test(ficha.relativo)) return [];
  const linhas = [
    ...new Set([
      ...linhasComPadrao(ficha, IDENTIDADE_LIDA_DO_PAYLOAD),
      ...linhasComPadrao(ficha, IDENTIDADE_DESESTRUTURADA),
    ]),
  ];
  return linhas.map((linha) =>
    achado(
      CATEGORIA,
      'identidade-do-payload',
      'aviso',
      ficha,
      linha,
      'identidade ou papel lido do que o cliente mandou',
      'quem pede vem da sessão/conexão autenticada (request.user, socket.data); o payload só diz o que se pede',
    ),
  );
}

function acoplamentoEntreModulos(contexto, ficha) {
  const modulo = moduloDe(ficha);
  if (!modulo) return [];
  const achados = [];
  for (const importacao of ficha.imports) {
    const destino = importacao.resolvido ? contexto.fichas.get(importacao.resolvido) : null;
    const outroModulo = destino?.workspace === ficha.workspace ? moduloDe(destino) : null;
    if (
      !outroModulo ||
      outroModulo === modulo ||
      importacao.ehTipo ||
      !destino.nome.endsWith('.dao.ts')
    )
      continue;
    achados.push(
      achado(
        CATEGORIA,
        'repositorio-de-outro-modulo',
        'info',
        ficha,
        importacao.linha,
        `importa o DAO \`${destino.nome}\` do módulo ${outroModulo}`,
        'pedir ao service do módulo dono, ou levar o que é comum para uma pasta transversal',
      ),
    );
  }
  // PO de outro módulo é chave estrangeira (references); service é a porta
  // de entrada sancionada de um módulo; DAO de fora já é cobrado em quem o
  // importa (repositorio-de-outro-modulo). O resto importado de fora é helper.
  const ehPortaDoModulo = /\.(po|service|port|plugin|dao)\.ts$/.test(ficha.nome);
  const modulosQueImportam = new Set(
    [...ficha.importadoPor]
      .map((caminho) => contexto.fichas.get(caminho))
      .filter((outra) => !outra.ehTeste && outra.workspace === ficha.workspace)
      .map(moduloDe)
      .filter((outro) => outro && outro !== modulo),
  );
  if (!ehPortaDoModulo && modulosQueImportam.size > 0) {
    achados.push(
      achado(
        CATEGORIA,
        'helper-compartilhado-em-modulo',
        'info',
        ficha,
        1,
        `importado pelos módulos ${[...modulosQueImportam].join(', ')}`,
        'genérico vai para src/lib/; regra de jogo vai para packages/game-core',
      ),
    );
  }
  return achados;
}

// O handler é callback anônimo (`app.post('/x', async (req) => …)`,
// `socket.on('token:move', …)`), que não vira função nomeada: é medido aqui.
function handlerComLogica(contexto, ficha) {
  if (!/\.(routes|gateway)\.ts$/.test(ficha.nome)) return [];
  const { ts } = contexto;
  const achados = [];
  const visita = (no) => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      METODOS_DE_REGISTRO.test(no.expression.name.text)
    ) {
      const callback = no.arguments.find(
        (argumento) => ts.isArrowFunction(argumento) || ts.isFunctionExpression(argumento),
      );
      if (callback) achados.push(...medirHandler(ts, ficha, no, callback));
    }
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function medirHandler(ts, ficha, chamada, callback) {
  const linha = linhaDe(ficha.fonte, callback.getStart(ficha.fonte));
  const uteis = linhasUteis(ficha, linha, linhaDe(ficha.fonte, callback.end));
  const { complexidade, profundidade } = medirCorpo(ts, callback);
  const dentroDoTeto =
    uteis <= TETO_DE_LINHAS_DO_HANDLER &&
    complexidade <= TETO_DE_COMPLEXIDADE_DO_HANDLER &&
    profundidade <= TETO_DE_PROFUNDIDADE_DO_HANDLER;
  if (dentroDoTeto) return [];
  const rota =
    chamada.arguments[0] && ts.isStringLiteralLike(chamada.arguments[0])
      ? ` '${chamada.arguments[0].text}'`
      : '';
  return [
    achado(
      CATEGORIA,
      'handler-com-logica',
      'info',
      ficha,
      linha,
      `handler ${chamada.expression.name.text}${rota} tem ${uteis} linhas, complexidade ${complexidade} e ${profundidade} nível(is): a borda valida o DTO, chama o service e traduz o erro`,
      'a decisão vai para o BO; a orquestração, para o service',
    ),
  ];
}

function regrasDoClient(contexto, ficha) {
  const achados = [];
  for (const linha of linhasComPadrao(ficha, /\bprocess\.env\b/)) {
    achados.push(
      achado(
        CATEGORIA,
        'process-env-no-client',
        'erro',
        ficha,
        linha,
        '`process.env` no client: o Vite não o define no browser',
        'config pública por import.meta.env.VITE_* lida num módulo só; segredo nunca vai para o client',
      ),
    );
  }
  const ehDeTela =
    /^src\/(components|features|app)\//.test(ficha.relativo) && ficha.extensao === '.tsx';
  if (ehDeTela) achados.push(...transporteCruNaTela(ficha));
  if (ficha.relativo.startsWith('src/renderer/')) achados.push(...reactNoRenderer(ficha));
  achados.push(
    ...logicaNaRota(ficha),
    ...componenteNaAreaErrada(contexto, ficha),
    ...logicaExportadaDeComponente(ficha),
  );
  return achados;
}

function transporteCruNaTela(ficha) {
  const fetches = linhasComPadrao(ficha, /(?<![\w.])fetch\(/).map((linha) =>
    achado(
      CATEGORIA,
      'fetch-cru-em-componente',
      'aviso',
      ficha,
      linha,
      '`fetch(` direto no componente',
      'cliente HTTP em src/services/, validando a resposta com o DTO de @lorkarium/contracts',
    ),
  );
  const sockets = linhasComPadrao(
    ficha,
    /\b(?:socket|io)\s*\.\s*(?:emit|on|off|once)\s*\(|(?<![\w.])io\s*\(/,
  ).map((linha) =>
    achado(
      CATEGORIA,
      'socket-cru-em-componente',
      'aviso',
      ficha,
      linha,
      'Socket.IO direto no componente',
      'comando e assinatura de evento passam por src/services/; o componente lê o estado confirmado da store',
    ),
  );
  return [...fetches, ...sockets];
}

// spec §2.3: a representação gráfica não depende de React; o renderer é
// TypeScript sobre PixiJS, e quem o monta é um componente de features/.
function reactNoRenderer(ficha) {
  return ficha.imports
    .filter((importacao) => /^react(-dom)?(\/|$)/.test(importacao.especificador))
    .map((importacao) =>
      achado(
        CATEGORIA,
        'react-no-renderer',
        'erro',
        ficha,
        importacao.linha,
        `src/renderer/ importa ${importacao.especificador}`,
        'o renderer expõe uma API de TS (montar, atualizar, destruir); o componente de features/ a chama',
      ),
    );
}

function logicaNaRota(ficha) {
  if (!ficha.relativo.startsWith('src/app/') || ficha.extensao !== '.tsx') return [];
  const proprias = ficha.funcoes.filter(
    (f) => f.nome && !f.ehComponente && !f.ehHook && !ROTULOS_DE_ROTA.has(f.nome),
  );
  if (proprias.length < 2 && ficha.totalDeLinhas <= TETO_DE_LINHAS_DA_ROTA_DO_CLIENT) return [];
  return [
    achado(
      CATEGORIA,
      'logica-na-rota',
      'info',
      ficha,
      1,
      `rota com ${proprias.length} funções próprias e ${ficha.totalDeLinhas} linhas`,
      'a rota monta a tela; lógica vai para features/<área>/, src/lib/ ou game-core',
    ),
  ];
}

const ROTULOS_DE_ROTA = new Set([
  'loader',
  'action',
  'clientLoader',
  'clientAction',
  'meta',
  'links',
  'handle',
  'shouldRevalidate',
  'headers',
]);

function areaDe(ficha) {
  return ficha.relativo.match(/^src\/features\/([^/]+)\//)?.[1] ?? null;
}

function componenteNaAreaErrada(contexto, ficha) {
  const area = areaDe(ficha);
  if (!area) return [];
  const importadores = [...ficha.importadoPor]
    .map((c) => contexto.fichas.get(c))
    .filter((f) => !f.ehTeste && f.workspace === ficha.workspace);
  if (importadores.length === 0) return [];
  const areas = new Set(importadores.map((f) => areaDe(f) ?? 'fora'));
  if (areas.size !== 1 || areas.has(area) || areas.has('fora')) return [];
  const unica = [...areas][0];
  return [
    achado(
      CATEGORIA,
      'componente-na-area-errada',
      'info',
      ficha,
      1,
      `só features/${unica}/ usa este arquivo, mas ele mora em features/${area}/`,
      `mover para features/${unica}/ (ou para src/components/ se outra área passar a usar)`,
    ),
  ];
}

function logicaExportadaDeComponente(ficha) {
  if (ficha.extensao !== '.tsx' || !/^src\/(components|features)\//.test(ficha.relativo)) return [];
  return ficha.funcoes
    .filter(
      (f) => f.exportada && f.nome && !f.ehComponente && !f.ehHook && !f.contemJsx && !f.ehMetodo,
    )
    .map((f) =>
      achado(
        CATEGORIA,
        'logica-exportada-de-componente',
        'info',
        ficha,
        f.linha,
        `\`${f.nome}\` é lógica pura exportada de um arquivo de componente`,
        'regra de jogo → game-core; genérico → src/lib/; da área → um .ts irmão; sempre com teste sem DOM',
      ),
    );
}

// spec §2.3: o motor de combate não depende de React, PixiJS, Fastify nem
// Socket.IO. Ele roda nos dois lados, então nem `node:` entra.
export function regrasDoGameCore(contexto, ficha) {
  const achados = ficha.imports
    .filter((importacao) => !importacao.especificador.startsWith('.'))
    .map((importacao) => {
      const severidade = importacao.ehTipo ? 'aviso' : 'erro';
      return achado(
        CATEGORIA,
        'game-core-com-dependencia',
        severidade,
        ficha,
        importacao.linha,
        `game-core importa \`${importacao.especificador}\`${importacao.ehTipo ? ' (só tipo)' : ''}`,
        'o game-core é TypeScript puro e roda no server e no browser: quem precisa da lib é quem chama',
      );
    });
  const naoDeterministico =
    /\bMath\.random\(|\bDate\.now\(|\bnew Date\(\s*\)|\bcrypto\.randomUUID\(/;
  for (const linha of linhasComPadrao(ficha, naoDeterministico)) {
    achados.push(
      achado(
        CATEGORIA,
        'game-core-nao-deterministico',
        'aviso',
        ficha,
        linha,
        'relógio ou sorteio dentro da regra de jogo',
        'receber o instante, o id ou o resultado do sorteio por parâmetro: server e client precisam chegar no mesmo estado, e o teste precisa repetir',
      ),
    );
  }
  return achados;
}

// DTO transfere dado e não carrega regra de negócio (padrão DTO); o único
// pacote que ele conhece é o zod.
function regrasDoContracts(contexto, ficha) {
  const dependencias = ficha.imports
    .filter(
      (importacao) =>
        !importacao.especificador.startsWith('.') &&
        !importacao.ehTipo &&
        !DEPENDENCIAS_DO_CONTRACTS.has(importacao.especificador),
    )
    .map((importacao) =>
      achado(
        CATEGORIA,
        'contracts-com-dependencia',
        'erro',
        ficha,
        importacao.linha,
        `contracts importa \`${importacao.especificador}\``,
        'contracts só conhece o zod: DTO é forma, não comportamento',
      ),
    );
  const logica = ficha.funcoes
    .filter((f) => f.exportada && f.nome && !f.ehMetodo)
    .map((f) =>
      achado(
        CATEGORIA,
        'logica-no-contrato',
        'aviso',
        ficha,
        f.linha,
        `\`${f.nome}\` é função exportada de contracts`,
        'DTO é schema + tipo inferido; regra de jogo vai para o game-core e decisão do server para o BO do módulo',
      ),
    );
  return [...dependencias, ...logica];
}
