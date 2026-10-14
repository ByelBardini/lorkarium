#!/usr/bin/env node
// Conferência de camadas de uma fatia do server: o papel de cada arquivo (PO,
// DAO, BO, mapper, service, routes, gateway, port, plugin), a direção dos
// imports entre eles, as regras transversais e o que falta ligar (rota no
// plugin, plugin no app, spec da regra). Aceita alvo em server/ e nos pacotes
// que a fatia toca: packages/contracts (DTO) e packages/game-core (VO).
// Reaproveita o ambiente, as fichas e o formato de achado da skill refatorar
// (../refatorar/lib) — não instala nada e não escreve nada.
// Uso: node .claude/skills/desenvolver-server/driver.mjs <alvo> [--json] [--min aviso] [--so camadas,fatia] [--limite N]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { descreverAmbiente, paraBarras } from '../refatorar/lib/ambiente.mjs';
import { contextosDoAlvo } from '../refatorar/lib/contextos.mjs';
import { montarFichas } from '../refatorar/lib/fichas.mjs';
import { analisarCamadas, camadaDaFicha } from './lib/camadas.mjs';
import { analisarDependencias } from './lib/dependencias.mjs';
import { analisarContrato } from './lib/contrato.mjs';
import { analisarFatia } from './lib/fatia.mjs';
import {
  ORDEM_DAS_CATEGORIAS,
  filtrarAchados,
  imprimirRelatorio,
  montarResumo,
} from './lib/relatorio.mjs';

const TIPOS_ACEITOS = new Set(['server', 'contracts', 'game-core']);

const USO = `uso: node .claude/skills/desenvolver-server/driver.mjs <alvo> [opções]
  <alvo>            pasta ou arquivo em server/, packages/contracts/ ou packages/game-core/,
                    relativo à raiz do repo (ex.: server/src/modules/combat)
  --json            saída em JSON (resumo + achados) em vez do relatório em texto
  --min <sev>       severidade mínima: erro | aviso | info (padrão info)
  --so <cats>       só estas categorias, separadas por vírgula: ${ORDEM_DAS_CATEGORIAS.join(', ')}
  --limite <n>      achados por categoria no texto (padrão 30; 0 = todos)`;

export function analisar(alvoInformado, raizDoProcesso = process.cwd()) {
  const inicio = Date.now();
  const ambiente = descreverAmbiente(alvoInformado, raizDoProcesso);
  if (!TIPOS_ACEITOS.has(ambiente.app.tipo)) {
    throw new Error(
      `O alvo ${alvoInformado} está em ${ambiente.app.nome} (${ambiente.app.tipo}); ` +
        'esta skill é do server e dos pacotes que ele usa (contracts, game-core) — para o client use /construir-tela ou /refatorar-client',
    );
  }
  const fichas = montarFichas(ambiente);
  const doAlvo = fichasDoAlvo(ambiente, fichas);
  const contexto = { ambiente, ts: ambiente.ts, app: ambiente.app, fichas, doAlvo };
  const achados = [
    ...analisarCamadas(contexto),
    ...analisarDependencias(contexto),
    ...analisarContrato(contexto),
    ...analisarFatia(contexto),
  ];
  return {
    alvo: paraBarras(path.relative(ambiente.repo, ambiente.alvo)),
    app: { nome: ambiente.app.nome, tipo: ambiente.app.tipo },
    contextos: contextosDoAlvo(ambiente),
    camadas: inventarioDeCamadas(doAlvo),
    estatisticas: {
      arquivosDoAlvo: doAlvo.length,
      arquivosDoMonorepo: fichas.size,
      milissegundos: Date.now() - inicio,
    },
    achados,
  };
}

function fichasDoAlvo(ambiente, fichas) {
  const alvo = path.resolve(ambiente.alvo);
  const ehArquivo = fs.statSync(alvo).isFile();
  return [...fichas.values()].filter((ficha) => {
    const caminho = path.resolve(ficha.caminho);
    const dentro = ehArquivo ? caminho === alvo : caminho.startsWith(alvo + path.sep);
    return dentro && !ficha.gerado && !ficha.ehTeste;
  });
}

function inventarioDeCamadas(doAlvo) {
  const inventario = {};
  for (const ficha of doAlvo) {
    const camada = camadaDaFicha(ficha);
    if (camada === null) continue;
    inventario[camada] = (inventario[camada] ?? 0) + 1;
  }
  return inventario;
}

function lerOpcoes(argumentos) {
  const opcoes = { alvo: null, json: false, min: 'info', so: null, limite: 30 };
  for (let indice = 0; indice < argumentos.length; indice += 1) {
    const atual = argumentos[indice];
    if (atual === '--ajuda' || atual === '--help' || atual === '-h')
      return { ...opcoes, ajuda: true };
    if (atual === '--json') opcoes.json = true;
    else if (atual === '--min') opcoes.min = argumentos[(indice += 1)];
    else if (atual === '--limite') opcoes.limite = Number(argumentos[(indice += 1)]);
    else if (atual === '--so') opcoes.so = lerCategorias(argumentos[(indice += 1)]);
    else if (!atual.startsWith('-')) opcoes.alvo = atual;
  }
  if (!['erro', 'aviso', 'info'].includes(opcoes.min))
    throw new Error(`--min "${opcoes.min}" inválido; esperado erro, aviso ou info`);
  return opcoes;
}

function lerCategorias(valor) {
  const categorias = String(valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const desconhecida = categorias.find((item) => !ORDEM_DAS_CATEGORIAS.includes(item));
  if (desconhecida)
    throw new Error(
      `--so com categoria desconhecida "${desconhecida}"; esperado uma de ${ORDEM_DAS_CATEGORIAS.join(', ')}`,
    );
  return categorias;
}

function principal() {
  let opcoes;
  try {
    opcoes = lerOpcoes(process.argv.slice(2));
  } catch (erro) {
    process.stderr.write(`${erro.message}\n\n${USO}\n`);
    process.exit(1);
  }
  if (opcoes.ajuda) {
    process.stdout.write(`${USO}\n`);
    return;
  }
  if (!opcoes.alvo) {
    process.stderr.write(`Informe o alvo.\n\n${USO}\n`);
    process.exit(2);
  }
  try {
    const resultado = analisar(opcoes.alvo);
    const filtrados = filtrarAchados(resultado.achados, opcoes);
    const saida = { ...resultado, achados: filtrados, resumo: montarResumo(filtrados) };
    process.stdout.write(
      opcoes.json ? `${JSON.stringify(saida, null, 2)}\n` : `${imprimirRelatorio(saida, opcoes)}\n`,
    );
  } catch (erro) {
    process.stderr.write(`${erro.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal();
}
