#!/usr/bin/env node
// Auditoria estática dos testes de um alvo (spec, pasta de test/ ou
// arquivo/pasta de src/) de qualquer workspace: onde o spec mora, quem espelha
// quem, se cada it prova alguma coisa e se o nome descreve um cenário.
// Reaproveita o ambiente, os contextos e o formato de achado da skill
// refatorar (../refatorar/lib).
// Uso: node .claude/skills/testar/driver.mjs <alvo> [--json] [--min aviso] [--so prova,cenarios] [--limite N]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { descreverAmbiente, paraBarras } from '../refatorar/lib/ambiente.mjs';
import { achado } from '../refatorar/lib/achados.mjs';
import { contextosDoAlvo } from '../refatorar/lib/contextos.mjs';
import { ehSpec, fonteDispensaSpec, specsDaFonte } from './lib/espelho.mjs';
import { lerSpec } from './lib/leitura-de-specs.mjs';
import { analisarLugar } from './lib/regras-de-lugar.mjs';
import { analisarProva } from './lib/regras-de-prova.mjs';
import { analisarCenarios } from './lib/regras-de-cenario.mjs';
import {
  ORDEM_DAS_CATEGORIAS,
  filtrarAchados,
  imprimirRelatorio,
  montarResumo,
} from './lib/relatorio.mjs';

const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const EXTENSOES = new Set(['.ts', '.tsx']);

const USO = `uso: node .claude/skills/testar/driver.mjs <alvo> [opções]
  <alvo>            spec, pasta de test/ ou arquivo/pasta de src/, relativo à raiz do repo
                    (ex.: server/src/modules/combat, packages/game-core/test)
  --json            saída em JSON (espelho + resumo + achados) em vez do relatório em texto
  --min <sev>       severidade mínima: erro | aviso | info (padrão info)
  --so <cats>       só estas categorias, separadas por vírgula: ${ORDEM_DAS_CATEGORIAS.join(', ')}
  --limite <n>      achados por categoria no texto (padrão 30; 0 = todos)`;

export function analisar(alvoInformado, raizDoProcesso = process.cwd()) {
  const inicio = Date.now();
  const ambiente = descreverAmbiente(alvoInformado, raizDoProcesso);
  const arquivos = listarArquivos(ambiente.alvo).map((absoluto) => ({
    absoluto,
    relativo: paraBarras(path.relative(ambiente.app.raiz, absoluto)),
  }));
  const fontes = arquivos.filter((item) => ehFonteQuePedeSpec(ambiente, item));
  const fichas = new Map();
  const lerComCache = (absoluto) =>
    fichas.get(absoluto) ?? fichas.set(absoluto, lerSpec(ambiente, absoluto)).get(absoluto);
  const importsDoSpec = (relativo) =>
    lerComCache(path.join(ambiente.app.raiz, relativo)).importsResolvidos;
  const espelho = fontes.map((item) => ({
    fonte: item.relativo,
    ...specsDaFonte(ambiente.app, item.relativo, importsDoSpec),
  }));
  const specs = lerSpecs(ambiente, arquivos, espelho, lerComCache);
  const contexto = { app: ambiente.app, specs };
  const achados = [
    ...achadosDeEspelho(ambiente, espelho),
    ...analisarLugar(contexto),
    ...analisarProva(contexto),
    ...analisarCenarios(contexto),
  ];
  return {
    alvo: paraBarras(path.relative(ambiente.repo, ambiente.alvo)),
    app: { nome: ambiente.app.nome, tipo: ambiente.app.tipo },
    contextos: contextosDoAlvo(ambiente),
    espelho: espelho.map((par) => ({
      fonte: par.fonte,
      canonico: par.canonico,
      specs: par.existentes,
    })),
    estatisticas: {
      specs: specs.length,
      testes: specs.reduce((soma, ficha) => soma + ficha.testes.length, 0),
      pulados: specs.reduce(
        (soma, ficha) =>
          soma +
          ficha.testes.filter(
            (t) => t.modificadores.includes('skip') || t.modificadores.includes('todo'),
          ).length,
        0,
      ),
      fontes: fontes.length,
      milissegundos: Date.now() - inicio,
    },
    achados,
  };
}

function ehFonteQuePedeSpec(ambiente, item) {
  if (!item.relativo.startsWith('src/') || ehSpec(item.relativo)) return false;
  const texto = fs.readFileSync(item.absoluto, 'utf8');
  return !fonteDispensaSpec(item.relativo, texto) && !soTipos(ambiente, item.absoluto, texto);
}

function listarArquivos(alvo) {
  if (fs.statSync(alvo).isFile()) return [alvo];
  const saida = [];
  for (const entrada of fs.readdirSync(alvo, { withFileTypes: true })) {
    const caminho = path.join(alvo, entrada.name);
    if (entrada.isDirectory() && !PASTAS_IGNORADAS.has(entrada.name))
      saida.push(...listarArquivos(caminho));
    else if (
      entrada.isFile() &&
      EXTENSOES.has(path.extname(entrada.name)) &&
      !entrada.name.endsWith('.d.ts')
    )
      saida.push(caminho);
  }
  return saida;
}

// Specs do alvo mais os que espelham as fontes do alvo, sem repetir.
function lerSpecs(ambiente, arquivos, espelho, lerComCache) {
  const caminhos = new Set(
    arquivos.filter((item) => ehSpec(item.relativo)).map((item) => item.absoluto),
  );
  for (const par of espelho)
    for (const spec of par.existentes) caminhos.add(path.join(ambiente.app.raiz, spec));
  return [...caminhos].sort().map(lerComCache);
}

// Arquivo só de tipos (a porta como `interface`, o tipo inferido do PO) não
// tem comportamento para provar.
function soTipos(ambiente, caminho, texto) {
  const { ts } = ambiente;
  const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, false);
  return fonte.statements.every(
    (declaracao) =>
      ts.isInterfaceDeclaration(declaracao) ||
      ts.isTypeAliasDeclaration(declaracao) ||
      ts.isImportDeclaration(declaracao) ||
      (ts.isExportDeclaration(declaracao) && declaracao.isTypeOnly),
  );
}

function achadosDeEspelho(ambiente, espelho) {
  return espelho
    .filter((par) => par.existentes.length === 0)
    .map((par) => {
      const ficha = {
        relativoAoRepo: paraBarras(
          path.relative(ambiente.repo, path.join(ambiente.app.raiz, par.fonte)),
        ),
      };
      const canonico = paraBarras(
        path.relative(ambiente.repo, path.join(ambiente.app.raiz, par.canonico)),
      );
      return achado(
        'espelho',
        'fonte-sem-spec',
        'aviso',
        ficha,
        1,
        'nenhum spec espelha este arquivo',
        `criar ${canonico} com os cenários que ele promete`,
      );
    });
}

function lerOpcoes(argumentos) {
  const opcoes = { json: false, min: 'info', so: null, limite: 30, ajuda: false };
  const posicionais = [];
  for (let i = 0; i < argumentos.length; i += 1) {
    const atual = argumentos[i];
    if (atual === '--json') opcoes.json = true;
    else if (atual === '--ajuda' || atual === '--help') opcoes.ajuda = true;
    else if (atual === '--min') opcoes.min = argumentos[++i];
    else if (atual === '--so') opcoes.so = argumentos[++i]?.split(',').map((c) => c.trim());
    else if (atual === '--limite') opcoes.limite = Number(argumentos[++i]);
    else posicionais.push(atual);
  }
  return { opcoes, alvo: posicionais[0] ?? null };
}

function principal() {
  const { opcoes, alvo } = lerOpcoes(process.argv.slice(2));
  if (opcoes.ajuda) return imprimirESair(USO, 0);
  if (!alvo) return imprimirESair(USO, 2);
  const invalida = opcoes.so?.find((categoria) => !ORDEM_DAS_CATEGORIAS.includes(categoria));
  if (invalida)
    return imprimirESair(
      `categoria "${invalida}" inválida; esperado uma de ${ORDEM_DAS_CATEGORIAS.join(', ')}`,
      2,
    );
  if (!['erro', 'aviso', 'info'].includes(opcoes.min))
    return imprimirESair(`--min "${opcoes.min}" inválido; esperado erro, aviso ou info`, 2);
  const resultado = analisar(alvo);
  const achados = filtrarAchados(resultado.achados, opcoes);
  const filtrado = { ...resultado, achados, resumo: montarResumo(achados) };
  process.stdout.write(
    opcoes.json
      ? `${JSON.stringify(filtrado, null, 2)}\n`
      : `${imprimirRelatorio(filtrado, opcoes)}\n`,
  );
  return 0;
}

function imprimirESair(texto, codigo) {
  (codigo === 0 ? process.stdout : process.stderr).write(`${texto}\n`);
  return codigo;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = principal();
  } catch (erro) {
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  }
}
