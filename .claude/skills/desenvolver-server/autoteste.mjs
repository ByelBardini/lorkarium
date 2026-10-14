#!/usr/bin/env node
// Roda o driver na fixture (um monorepo de mentira com um módulo-molde limpo,
// `campaigns`, e um módulo que viola cada regra de propósito, `sessions`, mais
// game-core e contracts) e confere, regra por regra, o que precisa disparar e
// o que precisa ficar calado. Regra nova entra com uma linha na fixture e uma
// expectativa aqui.
// Uso: node .claude/skills/desenvolver-server/autoteste.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analisar } from './driver.mjs';
import { ORDEM_DAS_CATEGORIAS } from './lib/relatorio.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// [categoria, regra, arquivo]: precisa aparecer pelo menos uma vez.
const ESPERADOS = [
  ['camadas', 'consulta-fora-do-dao', 'sessions.bo.ts'],
  ['camadas', 'consulta-fora-do-dao', 'sessions.routes.ts'],
  ['camadas', 'camada-pura-com-io', 'sessions.bo.ts'],
  ['camadas', 'camada-pura-com-io', 'sessions.mapper.ts'],
  ['camadas', 'camada-pura-com-relogio', 'sessions.bo.ts'],
  ['camadas', 'camada-pura-com-relogio', 'hit-points.vo.ts'],
  ['camadas', 'po-com-logica', 'sessions.po.ts'],
  ['camadas', 'porta-com-lib-de-terceiro', 'sessions.port.ts'],
  ['camadas', 'porta-com-implementacao', 'sessions.port.ts'],
  ['camadas', 'adaptador-fora-da-infraestrutura', 'sessions.port.ts'],
  ['camadas', 'borda-sem-dto', 'sessions.routes.ts'],
  ['camadas', 'borda-sem-dto', 'sessions.gateway.ts'],
  ['camadas', 'schema-fora-do-contracts', 'sessions.service.ts'],
  ['camadas', 'dto-fora-do-contracts', 'join-session.dto.ts'],
  ['camadas', 'vo-fora-do-game-core', 'seat.vo.ts'],
  ['camadas', 'vo-mutavel', 'hit-points.vo.ts'],
  ['camadas', 'vo-mutavel', 'initiative.vo.ts'],
  ['camadas', 'vo-com-identidade', 'hit-points.vo.ts'],
  ['camadas', 'vo-sem-construtor', 'initiative.vo.ts'],
  ['camadas', 'dto-sem-zod', 'token.dto.ts'],
  ['camadas', 'dto-com-logica', 'session.dto.ts'],
  ['camadas', 'dto-frouxo', 'session.dto.ts'],
  ['dependencias', 'seta-invertida', 'sessions.bo.ts'],
  ['dependencias', 'seta-invertida', 'sessions.dao.ts'],
  ['dependencias', 'seta-invertida', 'sessions.mapper.ts'],
  ['dependencias', 'seta-invertida', 'sessions.po.ts'],
  ['dependencias', 'transversal-conhece-modulo', 'knows-module.ts'],
  ['dependencias', 'borda-de-outro-modulo', 'orphan.routes.ts'],
  ['dependencias', 'game-core-com-dependencia', 'roll-order.ts'],
  ['contrato', 'process-env-direto', 'sessions.service.ts'],
  ['contrato', 'console-no-server', 'sessions.service.ts'],
  ['contrato', 'identidade-do-payload', 'sessions.routes.ts'],
  ['contrato', 'vo-por-assercao', 'sessions.service.ts'],
  ['contrato', 'db-importado-direto', 'sessions.service.ts'],
  ['fatia', 'plugin-fora-do-app', 'sessions.plugin.ts'],
  ['fatia', 'rotas-fora-do-plugin', 'sessions.routes.ts'],
  ['fatia', 'rotas-fora-do-plugin', 'orphan.routes.ts'],
  ['fatia', 'gateway-fora-do-plugin', 'sessions.gateway.ts'],
  ['fatia', 'modulo-sem-plugin', 'orphan.routes.ts'],
  ['fatia', 'bo-sem-spec', 'sessions.bo.ts'],
  ['fatia', 'vo-sem-spec', 'hit-points.vo.ts'],
  ['fatia', 'dto-com-regra-sem-spec', 'session.dto.ts'],
];

// Arquivos que precisam sair sem nenhum achado: o módulo-molde inteiro, o
// encanamento e os pacotes limpos. Cada um guarda um falso positivo possível.
const SILENCIOS = [
  'campaigns.po.ts',
  'campaigns.dao.ts',
  'campaign.bo.ts',
  'campaigns.error.ts',
  'campaigns.mapper.ts',
  'clock.port.ts',
  'campaigns.service.ts',
  'campaigns.routes.ts',
  'campaigns.gateway.ts',
  'campaigns.plugin.ts',
  'database/database.ts',
  'database/schema.ts',
  'system-clock.ts',
  'build-app.ts',
  'config/env.ts',
  'server/src/index.ts',
  'grid-position.vo.ts',
  'campaign.dto.ts',
];

// [regra, arquivo, quantidade exata] — o porquê de cada zero está na fixture.
const CONTAGENS_EXATAS = [
  // `socket.data.userId` é onde a conexão autenticada guarda o usuário.
  ['identidade-do-payload', 'campaigns.gateway.ts', 0],
  // O mapper constrói o BO a partir do PO: mapper → bo é a seta certa.
  ['seta-invertida', 'campaigns.mapper.ts', 0],
  // src/database/ junta os PO no schema do Drizzle por definição.
  ['transversal-conhece-modulo', 'schema.ts', 0],
  // O adaptador mora em src/infrastructure/ e importa a porta do módulo como tipo.
  ['adaptador-fora-da-infraestrutura', 'system-clock.ts', 0],
  ['transversal-conhece-modulo', 'system-clock.ts', 0],
  // src/app/ monta o grafo: importar a instância do db ali é o certo.
  ['db-importado-direto', 'build-app.ts', 0],
  // `import type { Database }` no DAO não é o singleton.
  ['db-importado-direto', 'campaigns.dao.ts', 0],
  ['bo-sem-spec', 'campaign.bo.ts', 0],
  ['vo-sem-spec', 'grid-position.vo.ts', 0],
  // env.ts usa z.strictObject e é src/config/: schema do server mora lá.
  ['schema-fora-do-contracts', 'env.ts', 0],
];

function conferirEsperados(achados) {
  return ESPERADOS.flatMap(([categoria, regra, arquivo]) => {
    const bateu = achados.some(
      (item) =>
        item.categoria === categoria &&
        item.regra === regra &&
        item.arquivo.endsWith(`/${arquivo}`),
    );
    return bateu ? [] : [`esperava ${categoria}/${regra} em ${arquivo}`];
  });
}

function conferirSilencios(achados) {
  return SILENCIOS.flatMap((arquivo) =>
    achados
      .filter((item) => item.arquivo.endsWith(`/${arquivo}`))
      .map(
        (item) =>
          `${arquivo} devia ficar em silêncio, mas disparou ${item.regra}:${item.linha} (${item.mensagem})`,
      ),
  );
}

function conferirContagens(achados) {
  return CONTAGENS_EXATAS.flatMap(([regra, arquivo, esperada]) => {
    const quantidade = achados.filter(
      (item) => item.regra === regra && item.arquivo.endsWith(`/${arquivo}`),
    ).length;
    return quantidade === esperada
      ? []
      : [`${regra} em ${arquivo}: esperava ${esperada}, veio ${quantidade}`];
  });
}

// Toda regra que disparou precisa de expectativa: sem isto, regra nova entra
// sem fixture e o autoteste segue verde sem provar nada.
function conferirCobertura(achados) {
  const esperadas = new Set(ESPERADOS.map(([, regra]) => regra));
  return [...new Set(achados.map((item) => item.regra))]
    .filter((regra) => !esperadas.has(regra))
    .map((regra) => `a regra ${regra} disparou na fixture e não tem expectativa no autoteste`);
}

function principal() {
  const alvos = ['server', path.join('packages', 'game-core'), path.join('packages', 'contracts')];
  const achados = alvos.flatMap(
    (alvo) => analisar(path.join('fixtures', 'monorepo', alvo), AQUI).achados,
  );
  const falhas = [
    ...conferirEsperados(achados),
    ...conferirSilencios(achados),
    ...conferirContagens(achados),
    ...conferirCobertura(achados),
  ];
  if (falhas.length > 0) {
    process.stderr.write(`${falhas.join('\n')}\n`);
    return 1;
  }
  const regras = new Set(achados.map((item) => item.regra));
  const porCategoria = ORDEM_DAS_CATEGORIAS.map(
    (categoria) => `${categoria} ${achados.filter((item) => item.categoria === categoria).length}`,
  ).join(' · ');
  process.stdout.write(
    `autoteste ok: ${achados.length} achados na fixture (${porCategoria}), ${regras.size} regras distintas, ${SILENCIOS.length} guardiões em silêncio\n`,
  );
  return 0;
}

process.exitCode = principal();
