#!/usr/bin/env node
// Roda o driver na fixture (um monorepo de mentira com specs propositalmente
// ruins e specs limpos) e confere que cada regra dispara onde deve e cala
// onde não deve. Uso: node .claude/skills/testar/autoteste.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analisar } from './driver.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// [categoria, regra, arquivo]: precisa aparecer pelo menos uma vez.
const ESPERADOS = [
  ['lugar', 'teste-fora-de-test', 'combat.service.spec.ts'],
  ['lugar', 'mock-da-unidade-sob-teste', 'combat.service.spec.ts'],
  ['lugar', 'mock-da-unidade-sob-teste', 'sum-values.spec.ts'],
  ['lugar', 'spec-importa-src-relativo', 'sum-values.spec.ts'],
  ['lugar', 'spec-sem-espelho', 'orphan.spec.ts'],
  ['espelho', 'fonte-sem-spec', 'combat.dao.ts'],
  ['espelho', 'fonte-sem-spec', 'untested.ts'],
  // DTO com refine tem regra própria para provar.
  ['espelho', 'fonte-sem-spec', 'move.dto.ts'],
  ['prova', 'teste-sem-assercao', 'combat.service.spec.ts'],
  ['prova', 'teste-sem-assercao', 'token-badge.spec.tsx'],
  ['prova', 'eco-do-mock', 'combat.service.spec.ts'],
  ['prova', 'so-verifica-chamada', 'combat.service.spec.ts'],
  ['prova', 'assercao-tautologica', 'combat.service.spec.ts'],
  ['prova', 'assercao-fraca', 'combat.service.spec.ts'],
  ['prova', 'so-snapshot', 'token-badge.spec.tsx'],
  ['prova', 'teste-pulado', 'combat.service.spec.ts'],
  ['prova', 'teste-exclusivo', 'combat.service.spec.ts'],
  ['prova', 'dependencia-fake-inline', 'combat.service.spec.ts'],
  ['cenarios', 'nome-sem-cenario', 'combat.service.spec.ts'],
  ['cenarios', 'nome-sem-cenario', 'token-badge.spec.tsx'],
  ['cenarios', 'nome-repetido', 'combat.service.spec.ts'],
  ['cenarios', 'describe-sem-teste', 'combat.service.spec.ts'],
  ['cenarios', 'cenario-longo', 'combat.service.spec.ts'],
  ['cenarios', 'regressao-sem-referencia', 'combat.service.spec.ts'],
  ['cenarios', 'regressao-sem-referencia', 'token-badge.spec.tsx'],
];

// Arquivos que precisam sair sem nenhum achado: são o guarda contra falso positivo.
const SILENCIOS = [
  'turn-order.bo.spec.ts',
  'integration/combat.spec.ts',
  'grid-position.vo.spec.ts',
  'support/token-factory.ts',
];

// [regra, arquivo, quantidade exata]: dispara uma vez só, ou nunca.
const CONTAGENS_EXATAS = [
  ['teste-sem-assercao', 'token-badge.spec.tsx', 1],
  // `screen.queryByText('x')` já carrega o esperado: not.toBeNull() não é fraco.
  ['assercao-fraca', 'token-badge.spec.tsx', 0],
  // O server não tem alias no tsconfig: o relativo é o único caminho.
  ['spec-importa-src-relativo', 'combat.service.spec.ts', 0],
  ['spec-importa-src-relativo', 'turn-order.bo.spec.ts', 0],
  // Fiação, declaração de tabela, só tipos, gerado, entrada e DTO sem regra.
  ['fonte-sem-spec', 'combat.plugin.ts', 0],
  ['fonte-sem-spec', 'combat.po.ts', 0],
  ['fonte-sem-spec', 'types.ts', 0],
  ['fonte-sem-spec', 'generated.tsx', 0],
  ['fonte-sem-spec', 'utils.ts', 0],
  ['fonte-sem-spec', 'main.tsx', 0],
  ['fonte-sem-spec', 'index.ts', 0],
  ['fonte-sem-spec', 'token.dto.ts', 0],
  ['fonte-sem-spec', 'sum-values.ts', 0],
  ['fonte-sem-spec', 'token-badge.tsx', 0],
  ['nome-sem-cenario', 'turn-order.bo.spec.ts', 0],
];

function rodar(alvo) {
  return analisar(path.join('fixtures', 'monorepo', alvo), AQUI).achados;
}

// A rodada em src/ audita os specs que espelham as fontes; os mesmos achados
// da rodada em test/ voltariam em dobro sem isto.
function semRepetir(achados) {
  const vistos = new Set();
  return achados.filter((item) => {
    const chave = `${item.arquivo}:${item.linha}:${item.regra}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

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

function conferirCobertura(achados) {
  const declaradas = new Set(ESPERADOS.map(([, regra]) => regra));
  return [...new Set(achados.map((item) => item.regra))]
    .filter((regra) => !declaradas.has(regra))
    .map((regra) => `a regra ${regra} disparou na fixture e não tem expectativa no autoteste`);
}

function principal() {
  const alvos = [
    'server/test',
    'server/src/modules/combat',
    'client/test',
    'client/src',
    'packages/game-core',
    'packages/contracts',
  ];
  const achados = semRepetir(alvos.flatMap(rodar));
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
  process.stdout.write(
    `autoteste ok: ${achados.length} achados na fixture, ${new Set(achados.map((item) => item.regra)).size} regras distintas, todos onde deviam\n`,
  );
  return 0;
}

process.exitCode = principal();
