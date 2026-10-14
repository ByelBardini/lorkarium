#!/usr/bin/env node
// Diagnóstico estático de um alvo (pasta ou arquivo) de qualquer workspace do
// monorepo (client/, server/, packages/game-core/, packages/contracts/):
// monólitos, código morto, duplicação, lógica genérica fora da lib, nomes,
// comentários e lugar na arquitetura. Lê o monorepo inteiro e ancora os
// achados no alvo.
// Uso: node .claude/skills/refatorar/driver.mjs <alvo> [--json] [--min aviso] [--so a,b] [--limite N]
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { descreverAmbiente, paraBarras } from './lib/ambiente.mjs';
import { contextosDoAlvo } from './lib/contextos.mjs';
import { montarFichas } from './lib/fichas.mjs';
import { analisarArquitetura } from './lib/arquitetura.mjs';
import { analisarDuplicacao } from './lib/duplicacao.mjs';
import { analisarUtilitarios } from './lib/utilitarios.mjs';
import { analisarMonoliticos } from './lib/monoliticos.mjs';
import { analisarCodigoMorto } from './lib/codigo-morto.mjs';
import { analisarComentarios, analisarNomes } from './lib/nomes-e-comentarios.mjs';
import {
  ORDEM_DAS_CATEGORIAS,
  filtrarAchados,
  imprimirRelatorio,
  montarResumo,
} from './lib/relatorio.mjs';

const ANALISADORES = {
  arquitetura: analisarArquitetura,
  duplicacao: analisarDuplicacao,
  utilitarios: analisarUtilitarios,
  monoliticos: analisarMonoliticos,
  'codigo-morto': analisarCodigoMorto,
  nomes: analisarNomes,
  comentarios: analisarComentarios,
};

const USO = `uso: node .claude/skills/refatorar/driver.mjs <alvo> [opções]
  <alvo>            pasta ou arquivo, relativo à raiz do repo (ex.: server/src/modules/combat)
  --json            saída em JSON (resumo + achados) em vez do relatório em texto
  --min <sev>       severidade mínima: erro | aviso | info (padrão info)
  --so <cats>       só estas categorias, separadas por vírgula: ${ORDEM_DAS_CATEGORIAS.join(', ')}
  --limite <n>      achados por categoria no texto (padrão 30; 0 = todos)`;

export function analisar(alvoInformado, raizDoProcesso = process.cwd()) {
  const inicio = Date.now();
  const ambiente = descreverAmbiente(alvoInformado, raizDoProcesso);
  const fichas = montarFichas(ambiente);
  const contexto = montarContexto(ambiente, fichas);
  const achados = Object.values(ANALISADORES).flatMap((analisador) => analisador(contexto));
  const doAlvo = contexto.fichasDoAlvo();
  return {
    alvo: paraBarras(path.relative(ambiente.repo, ambiente.alvo)),
    app: { nome: ambiente.app.nome, tipo: ambiente.app.tipo },
    contextos: contextosDoAlvo(ambiente),
    estatisticas: {
      arquivosDoAlvo: doAlvo.length,
      arquivosDoMonorepo: fichas.size,
      funcoes: doAlvo.reduce((soma, ficha) => soma + ficha.funcoes.length, 0),
      linhas: doAlvo.reduce((soma, ficha) => soma + ficha.totalDeLinhas, 0),
      milissegundos: Date.now() - inicio,
    },
    achados,
  };
}

function montarContexto(ambiente, fichas) {
  const { alvo } = ambiente;
  const ehDoAlvo = (ficha) => ficha.caminho === alvo || ficha.caminho.startsWith(alvo + path.sep);
  const fichasDoAlvo = () => [...fichas.values()].filter(ehDoAlvo);
  return {
    ts: ambiente.ts,
    ambiente,
    app: ambiente.app,
    repo: ambiente.repo,
    alvo,
    fichas,
    ehDoAlvo,
    fichasDoAlvo,
    alvoIncluiTestes: fichasDoAlvo().some((ficha) => ficha.ehTeste),
  };
}

function lerArgumentos(argv) {
  const opcoes = { alvo: null, json: false, min: 'info', so: null, limite: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opcoes.json = true;
    else if (arg === '--min') opcoes.min = argv[++i];
    else if (arg === '--so') opcoes.so = argv[++i]?.split(',').map((c) => c.trim());
    else if (arg === '--limite') opcoes.limite = Number(argv[++i]);
    else if (arg === '--ajuda' || arg === '--help' || arg === '-h') opcoes.ajuda = true;
    else if (arg.startsWith('--')) throw new Error(`Opção ${arg} desconhecida.\n${USO}`);
    else opcoes.alvo = arg;
  }
  validarOpcoes(opcoes);
  return opcoes;
}

function validarOpcoes(opcoes) {
  if (opcoes.ajuda) return;
  if (!opcoes.alvo) throw new Error(`Falta o alvo.\n${USO}`);
  if (!['erro', 'aviso', 'info'].includes(opcoes.min))
    throw new Error(`--min ${opcoes.min} inválido; esperado erro, aviso ou info`);
  const desconhecidas = (opcoes.so ?? []).filter((c) => !ORDEM_DAS_CATEGORIAS.includes(c));
  if (desconhecidas.length > 0)
    throw new Error(
      `--so com categoria desconhecida: ${desconhecidas.join(', ')}; esperado ${ORDEM_DAS_CATEGORIAS.join(', ')}`,
    );
  if (!Number.isInteger(opcoes.limite) || opcoes.limite < 0)
    throw new Error(`--limite ${opcoes.limite} inválido; esperado inteiro >= 0`);
}

function executar() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log(USO);
    return;
  }
  const resultado = analisar(opcoes.alvo);
  const achados = filtrarAchados(resultado.achados, opcoes);
  const filtrado = { ...resultado, achados, resumo: montarResumo(achados) };
  console.log(
    opcoes.json ? JSON.stringify(filtrado, null, 2) : imprimirRelatorio(filtrado, opcoes),
  );
}

const ehEntrada =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehEntrada) {
  try {
    executar();
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(erro instanceof Error && erro.message.startsWith('Falta o alvo') ? 2 : 1);
  }
}
