#!/usr/bin/env node
// Roda o driver na fixture (um monorepo de mentira com server, client,
// game-core e contracts cheios de cheiros propositais) e confere que cada
// regra dispara onde deve e cala onde não deve.
// Uso: node .claude/skills/refatorar/autoteste.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analisar } from './driver.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO = path.join(AQUI, 'fixtures', 'monorepo');

// [categoria, regra, sufixo do arquivo, trecho opcional da mensagem]
const ESPERADOS_NO_SERVER = [
  ['arquitetura', 'teste-ao-lado-do-codigo', 'sessions.service.spec.ts'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'sessions.routes.ts', 'socket.io'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'sessions.routes.ts', 'drizzle-orm'],
  ['arquitetura', 'import-profundo-de-outro-workspace', 'sessions.routes.ts'],
  ['arquitetura', 'process-env-direto', 'sessions.routes.ts'],
  ['arquitetura', 'identidade-do-payload', 'sessions.routes.ts'],
  ['arquitetura', 'console-em-producao', 'sessions.routes.ts'],
  ['arquitetura', 'handler-com-logica', 'sessions.routes.ts', "'/sessions/:id/join'"],
  ['arquitetura', 'repositorio-de-outro-modulo', 'sessions.routes.ts'],
  ['arquitetura', 'helper-compartilhado-em-modulo', 'initiative-order.ts'],
  // Com os dois lados no alvo, o achado ancora no primeiro arquivo em ordem
  // alfabética (combat/ antes de sessions/) e cita o outro na mensagem.
  ['duplicacao', 'bloco-duplicado', 'CombatReport.ts', 'session-summary.ts'],
  ['duplicacao', 'funcao-homonima', 'initiative-order.ts', 'session-summary.ts'],
  ['duplicacao', 'tipo-com-mesmos-membros', 'CombatReport.ts', 'ScoreLine'],
  ['utilitarios', 'utilitario-existente-ignorado', 'session-summary.ts', 'clamp-value.ts'],
  ['utilitarios', 'funcao-generica-fora-da-lib', 'session-summary.ts'],
  ['monoliticos', 'funcao-longa', 'sessions.routes.ts', 'resolveTurn'],
  ['monoliticos', 'funcao-complexa', 'sessions.routes.ts'],
  ['monoliticos', 'aninhamento-profundo', 'sessions.routes.ts'],
  ['monoliticos', 'muitos-parametros', 'CombatReport.ts'],
  ['codigo-morto', 'export-sem-uso', 'orphan.ts'],
  ['codigo-morto', 'export-sem-uso', 'initiative-order.ts', 'legacyOrder'],
  ['codigo-morto', 'export-usado-so-em-teste', 'initiative-order.ts'],
  ['codigo-morto', 'arquivo-orfao', 'orphan.ts'],
  ['codigo-morto', 'import-sem-uso', 'sessions.routes.ts'],
  ['codigo-morto', 'membro-privado-sem-uso', 'sessions.dao.ts'],
  ['codigo-morto', 'codigo-comentado', 'sessions.routes.ts'],
  ['codigo-morto', 'codigo-inalcancavel', 'sessions.routes.ts'],
  ['codigo-morto', 'marcador-pendente', 'sessions.routes.ts'],
  ['nomes', 'arquivo-fora-do-kebab-case', 'CombatReport.ts'],
  ['nomes', 'any-explicito', 'sessions.routes.ts'],
  ['nomes', 'export-sem-tipo-de-retorno', 'initiative-order.ts'],
  ['nomes', 'nome-generico', 'sessions.routes.ts', '`data`'],
  ['nomes', 'nome-vago', 'sessions.routes.ts', '`result`'],
  ['nomes', 'numero-magico', 'sessions.routes.ts'],
  ['nomes', 'mensagem-de-erro-sem-valor', 'sessions.routes.ts'],
  ['nomes', 'else-depois-de-return', 'sessions.routes.ts'],
  ['nomes', 'ternario-aninhado', 'sessions.routes.ts'],
  ['nomes', 'supressao-de-lint-ou-tipo', 'sessions.routes.ts'],
  ['comentarios', 'comentario-o-que', 'sessions.routes.ts'],
  ['comentarios', 'export-sem-docstring', 'initiative-order.ts'],
  ['comentarios', 'docstring-sem-exemplo', 'CombatReport.ts'],
  ['comentarios', 'comentario-de-secao', 'CombatReport.ts'],
];

const PROIBIDOS_NO_SERVER = [
  ['codigo-morto', 'arquivo-orfao', 'index.ts'],
  ['codigo-morto', 'arquivo-orfao', 'env.ts'],
  // O index.ts do app é consumidor de verdade, não re-exportação de pacote.
  ['codigo-morto', 'export-sem-uso', 'build-app.ts'],
  ['codigo-morto', 'export-sem-uso', 'clamp-value.ts'],
  ['arquitetura', 'process-env-direto', 'index.ts'],
  ['arquitetura', 'process-env-direto', 'env.ts'],
  // fastify em src/app/ e drizzle no DAO estão em casa.
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'build-app.ts'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'sessions.dao.ts'],
  // DAO importado de outro módulo é cobrado em quem importa, não duas vezes.
  ['arquitetura', 'helper-compartilhado-em-modulo', 'combat.dao.ts'],
  // O server não tem alias no tsconfig: o relativo é o único caminho.
  ['arquitetura', 'spec-importa-src-relativo', 'initiative-order.spec.ts'],
  ['utilitarios', 'utilitario-existente-ignorado', 'clamp-value.ts'],
  // O plugin de rotas soma os handlers; cada handler é medido por si.
  ['monoliticos', 'funcao-longa', 'sessions.routes.ts', 'sessionRoutes'],
];

const ESPERADOS_NO_CLIENT = [
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'token-list.tsx', 'pixi.js'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'token-list.tsx', 'zustand'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'token-list.tsx', 'socket.io-client'],
  ['arquitetura', 'import-profundo-de-outro-workspace', 'token-list.tsx'],
  ['arquitetura', 'process-env-no-client', 'token-list.tsx'],
  ['arquitetura', 'fetch-cru-em-componente', 'token-list.tsx'],
  ['arquitetura', 'socket-cru-em-componente', 'token-list.tsx'],
  ['arquitetura', 'react-no-renderer', 'board-renderer.ts'],
  ['arquitetura', 'spec-importa-src-relativo', 'token-list.spec.tsx'],
  ['arquitetura', 'logica-exportada-de-componente', 'token-list.tsx'],
  ['arquitetura', 'componente-na-area-errada', 'scene-header.tsx'],
  // O tipo do client que repete o DTO do contracts: atravessa workspace.
  ['duplicacao', 'tipo-com-mesmos-membros', 'token-list.tsx', 'TokenDto'],
  // O gridSize que o game-core já encapsula, e o window.history da lib.
  ['utilitarios', 'utilitario-existente-ignorado', 'token-list.tsx', 'grid.ts'],
  ['utilitarios', 'utilitario-existente-ignorado', 'token-list.tsx', 'browser-url.ts'],
  ['utilitarios', 'funcao-generica-fora-da-lib', 'token-list.tsx'],
  ['utilitarios', 'logica-generica-em-componente', 'token-list.tsx'],
  ['monoliticos', 'funcao-longa', 'token-list.tsx'],
  ['codigo-morto', 'export-usado-so-em-teste', 'token-list.tsx'],
  ['nomes', 'nome-vago', 'token-list.tsx'],
  ['nomes', 'nome-curto', 'token-list.tsx'],
  ['comentarios', 'export-sem-docstring', 'token-list.tsx'],
];

const PROIBIDOS_NO_CLIENT = [
  ['codigo-morto', 'arquivo-orfao', 'main.tsx'],
  ['codigo-morto', 'arquivo-orfao', 'token-list.tsx'],
  ['codigo-morto', 'export-sem-uso', 'browser-url.ts'],
  // `loader` é export de rota do React Router.
  ['codigo-morto', 'export-sem-uso', 'app-root.tsx'],
  ['arquitetura', 'lib-de-terceiro-fora-do-adaptador', 'board-renderer.ts'],
  ['utilitarios', 'utilitario-existente-ignorado', 'browser-url.ts'],
];

const ESPERADOS_NO_GAME_CORE = [
  ['arquitetura', 'game-core-com-dependencia', 'distance.ts', 'node:crypto'],
  ['arquitetura', 'game-core-com-dependencia', 'render-hint.ts', 'só tipo'],
  ['arquitetura', 'game-core-nao-deterministico', 'distance.ts'],
  ['codigo-morto', 'export-sem-uso', 'distance.ts', 'nenhum workspace usa'],
];

const PROIBIDOS_NO_GAME_CORE = [
  // O client e o server usam o cellOf (por import profundo, mas usam).
  ['codigo-morto', 'export-sem-uso', 'grid.ts'],
  ['codigo-morto', 'arquivo-orfao', 'index.ts'],
  // O game-core inteiro é a lib do domínio.
  ['utilitarios', 'funcao-generica-fora-da-lib', 'grid.ts'],
  ['nomes', 'nome-curto', 'distance.ts'],
];

const ESPERADOS_NO_CONTRACTS = [
  ['arquitetura', 'contracts-com-dependencia', 'token.dto.ts', '@fixture/game-core'],
  ['arquitetura', 'logica-no-contrato', 'token.dto.ts'],
  ['duplicacao', 'tipo-com-mesmos-membros', 'token.dto.ts', 'TokenView'],
  // Re-exportado por `export *` e sem consumidor: é API pública morta.
  ['codigo-morto', 'export-sem-uso', 'token.dto.ts', 'nenhum workspace usa'],
];

const PROIBIDOS_NO_CONTRACTS = [
  ['arquitetura', 'contracts-com-dependencia', 'token.dto.ts', '`zod`'],
];

// [regra, sufixo do arquivo, quantidade exata]
const CONTAGENS_EXATAS = [
  // `refetch()` não é `fetch(`: a regra usa lookbehind, não grep cru.
  ['fetch-cru-em-componente', 'token-list.tsx', 1],
  ['socket-cru-em-componente', 'token-list.tsx', 2],
];

function bate(achados, [categoria, regra, sufixo, trecho]) {
  return achados.some(
    (a) =>
      a.categoria === categoria &&
      a.regra === regra &&
      a.arquivo.endsWith(`/${sufixo}`) &&
      (!trecho || a.mensagem.includes(trecho)),
  );
}

function conferir(nome, achados, esperados, proibidos) {
  const falhas = [
    ...esperados
      .filter((item) => !bate(achados, item))
      .map((item) => `esperava ${item[1]} em ${item[2]}${item[3] ? ` (${item[3]})` : ''}`),
    ...proibidos
      .filter((item) => bate(achados, item))
      .map((item) => `não esperava ${item[1]} em ${item[2]}${item[3] ? ` (${item[3]})` : ''}`),
  ];
  console.log(
    `${falhas.length === 0 ? 'ok' : 'FALHOU'}  ${nome}: ${achados.length} achados, ${esperados.length} esperados, ${proibidos.length} proibidos`,
  );
  for (const falha of falhas) console.log(`   - ${falha}`);
  return falhas;
}

function conferirContagens(achados) {
  return CONTAGENS_EXATAS.flatMap(([regra, sufixo, esperada]) => {
    const quantidade = achados.filter(
      (a) => a.regra === regra && a.arquivo.endsWith(`/${sufixo}`),
    ).length;
    return quantidade === esperada
      ? []
      : [`${regra} em ${sufixo}: esperava ${esperada}, veio ${quantidade}`];
  });
}

// Regra nova entra com uma linha na fixture e uma expectativa aqui: regra que
// dispara sem expectativa declarada passa sem provar nada.
function conferirCobertura(achados, esperados) {
  const declaradas = new Set(esperados.map(([, regra]) => regra));
  return [...new Set(achados.map((a) => a.regra))]
    .filter((regra) => !declaradas.has(regra))
    .map((regra) => `a regra ${regra} disparou na fixture e não tem expectativa no autoteste`);
}

function rodar(workspace) {
  return analisar(path.join(MONOREPO, workspace)).achados;
}

const rodadas = [
  ['server', rodar('server'), ESPERADOS_NO_SERVER, PROIBIDOS_NO_SERVER],
  ['client', rodar('client'), ESPERADOS_NO_CLIENT, PROIBIDOS_NO_CLIENT],
  [
    'game-core',
    rodar(path.join('packages', 'game-core')),
    ESPERADOS_NO_GAME_CORE,
    PROIBIDOS_NO_GAME_CORE,
  ],
  [
    'contracts',
    rodar(path.join('packages', 'contracts')),
    ESPERADOS_NO_CONTRACTS,
    PROIBIDOS_NO_CONTRACTS,
  ],
];
const todos = rodadas.flatMap(([, achados]) => achados);
const esperados = rodadas.flatMap(([, , lista]) => lista);
const falhas = [
  ...rodadas.flatMap(([nome, achados, esperadosDaRodada, proibidos]) =>
    conferir(nome, achados, esperadosDaRodada, proibidos),
  ),
  ...conferirContagens(todos),
  ...conferirCobertura(todos, esperados),
];
for (const falha of falhas.filter(
  (item) => !item.startsWith('esperava') && !item.startsWith('não esperava'),
))
  console.log(`   - ${falha}`);
if (falhas.length > 0) {
  console.log(
    `\n${falhas.length} expectativa(s) falharam. Rode o driver na fixture para ver o relatório inteiro:`,
  );
  console.log(
    '  node .claude/skills/refatorar/driver.mjs .claude/skills/refatorar/fixtures/monorepo/server --limite 0',
  );
  process.exit(1);
}
console.log(
  `\nautoteste passou: ${todos.length} achados, ${new Set(todos.map((a) => a.regra)).size} regras distintas.`,
);
