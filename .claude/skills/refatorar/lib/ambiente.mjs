// Onde o alvo mora no monorepo: o workspace dono (client, server, game-core,
// contracts), os outros workspaces do pnpm-workspace.yaml, o `typescript` e os
// aliases de cada tsconfig. Os drivers leem o monorepo inteiro porque, aqui,
// "o util que já existe" e "quem usa este export" atravessam workspaces.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function paraBarras(caminho) {
  return caminho.split(path.sep).join('/');
}

export function raizDoRepo(inicio) {
  let atual = inicio;
  while (!fs.existsSync(path.join(atual, '.git'))) {
    const pai = path.dirname(atual);
    if (pai === atual) return inicio;
    atual = pai;
  }
  return atual;
}

export function encontrarRaizDoApp(alvoAbsoluto) {
  const partida = fs.statSync(alvoAbsoluto).isDirectory()
    ? alvoAbsoluto
    : path.dirname(alvoAbsoluto);
  let atual = partida;
  while (true) {
    const temManifesto = fs.existsSync(path.join(atual, 'package.json'));
    if (temManifesto && fs.existsSync(path.join(atual, 'src'))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) {
      throw new Error(
        `Nenhum package.json com pasta src/ acima de ${alvoAbsoluto}; ` +
          'o alvo precisa estar dentro de um workspace (client/, server/, packages/game-core/, packages/contracts/)',
      );
    }
    atual = pai;
  }
}

// A fixture de cada skill traz o próprio pnpm-workspace.yaml; sem ele, a busca
// subiria até o Lorkarium e trataria client/ e server/ reais como vizinhos.
export function raizDoMonorepo(raizDoApp) {
  let atual = raizDoApp;
  while (true) {
    if (fs.existsSync(path.join(atual, 'pnpm-workspace.yaml'))) return atual;
    const pai = path.dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

// Leitor mínimo do pnpm-workspace.yaml: só a lista `packages:`, com `pasta` ou
// `pasta/*`. É o que o projeto usa; YAML completo seria dependência nova.
export function padroesDoWorkspace(texto) {
  const padroes = [];
  let dentro = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (/^packages\s*:/.test(linha)) {
      dentro = true;
      continue;
    }
    if (dentro && /^\S/.test(linha)) dentro = false;
    const item = dentro ? linha.match(/^\s*-\s*['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/) : null;
    if (item && !item[1].startsWith('!')) padroes.push(item[1]);
  }
  return padroes;
}

function expandirPadrao(raiz, padrao) {
  if (!padrao.includes('*')) return [path.join(raiz, padrao)];
  const base = path.join(raiz, padrao.replace(/\/\*\*?$/, ''));
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => path.join(base, entrada.name));
}

function lerManifesto(raiz) {
  return JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
}

/** O papel do workspace pelas dependências e pelo nome do pacote.
 *
 *  Exemplo: `tipoDoWorkspace({ name: '@lorkarium/game-core' }) // 'game-core'` */
export function tipoDoWorkspace(manifesto) {
  const deps = { ...manifesto.dependencies, ...manifesto.devDependencies };
  if (deps.fastify) return 'server';
  if (deps.react) return 'client';
  const nome = manifesto.name ?? '';
  if (/(^|\/)game-core$/.test(nome)) return 'game-core';
  if (/(^|\/)contracts$/.test(nome)) return 'contracts';
  return 'pacote';
}

// `exports: { ".": "./src/index.ts" }` (ou string, ou `main`) → o arquivo que
// os outros workspaces importam quando escrevem `@lorkarium/<pacote>`.
function entradaDoPacote(raiz, manifesto) {
  const exportado = manifesto.exports;
  const ponto = typeof exportado === 'string' ? exportado : exportado?.['.'];
  const destino =
    typeof ponto === 'string' ? ponto : (ponto?.import ?? ponto?.default ?? manifesto.main);
  const candidatos = [destino, 'src/index.ts', 'src/index.tsx'].filter(Boolean);
  const achado = candidatos.map((c) => path.resolve(raiz, c)).find((c) => fs.existsSync(c));
  return achado ?? null;
}

export function carregarTypescript(candidatos) {
  for (const base of candidatos) {
    try {
      return createRequire(path.join(base, 'package.json'))('typescript');
    } catch {
      // tenta o próximo: a fixture não tem node_modules, a raiz do repo tem
    }
  }
  throw new Error(
    `typescript não encontrado a partir de ${candidatos.join(', ')}; rode pnpm install na raiz`,
  );
}

export function aliasesDoTsconfig(ts, raizDoApp) {
  const arquivo = path.join(raizDoApp, 'tsconfig.json');
  if (!fs.existsSync(arquivo)) return [];
  const { config } = ts.readConfigFile(arquivo, ts.sys.readFile);
  const opcoes = config?.compilerOptions ?? {};
  const base = path.resolve(raizDoApp, opcoes.baseUrl ?? '.');
  return Object.entries(opcoes.paths ?? {}).map(([padrao, destinos]) => ({
    prefixo: padrao.replace(/\*$/, ''),
    destino: path.resolve(base, String(destinos[0]).replace(/\*$/, '')),
  }));
}

function descreverWorkspace(ts, raiz, monorepo) {
  const manifesto = lerManifesto(raiz);
  const deps = { ...manifesto.dependencies, ...manifesto.devDependencies };
  return {
    raiz,
    nome: path.basename(raiz),
    pasta: paraBarras(path.relative(monorepo ?? path.dirname(raiz), raiz)),
    pacote: manifesto.name ?? path.basename(raiz),
    tipo: tipoDoWorkspace(manifesto),
    // App (server, client) não tem entrada de pacote: ninguém o importa, e o
    // index.ts dele é consumidor de verdade, não re-exportação.
    entrada: ['server', 'client'].includes(tipoDoWorkspace(manifesto))
      ? null
      : entradaDoPacote(raiz, manifesto),
    dependencias: new Set(Object.keys(deps)),
    aliases: aliasesDoTsconfig(ts, raiz),
  };
}

function listarWorkspaces(ts, monorepo, raizDoApp) {
  if (!monorepo) return [descreverWorkspace(ts, raizDoApp, null)];
  const texto = fs.readFileSync(path.join(monorepo, 'pnpm-workspace.yaml'), 'utf8');
  const raizes = padroesDoWorkspace(texto)
    .flatMap((padrao) => expandirPadrao(monorepo, padrao))
    .filter(
      (raiz) =>
        fs.existsSync(path.join(raiz, 'package.json')) && fs.existsSync(path.join(raiz, 'src')),
    );
  if (!raizes.some((raiz) => path.resolve(raiz) === path.resolve(raizDoApp)))
    raizes.push(raizDoApp);
  return raizes.map((raiz) => descreverWorkspace(ts, raiz, monorepo));
}

export function descreverAmbiente(alvoInformado, raizDoProcesso) {
  const alvo = path.resolve(raizDoProcesso, alvoInformado);
  if (!fs.existsSync(alvo)) {
    throw new Error(
      `Alvo ${alvoInformado} não existe (resolvido para ${alvo}); ` +
        'informe uma pasta ou arquivo relativo à raiz do repositório',
    );
  }
  const raizDoApp = encontrarRaizDoApp(alvo);
  const repo = raizDoRepo(raizDoApp);
  const monorepo = raizDoMonorepo(raizDoApp);
  const ts = carregarTypescript([raizDoApp, monorepo, repo].filter(Boolean));
  const workspaces = listarWorkspaces(ts, monorepo, raizDoApp);
  const app = workspaces.find((ws) => path.resolve(ws.raiz) === path.resolve(raizDoApp));
  return { ts, alvo, repo, monorepo: monorepo ?? raizDoApp, app, workspaces };
}

/** Os workspaces de que o app depende (`@lorkarium/game-core` no client, por
 *  exemplo): é onde mora a lógica que ele não deveria reescrever.
 *
 *  Exemplo: `dependenciasDoWorkspace(ambiente, ambiente.app).map((ws) => ws.tipo) // ['game-core', 'contracts']` */
export function dependenciasDoWorkspace(ambiente, workspace) {
  return ambiente.workspaces.filter(
    (ws) => ws !== workspace && workspace.dependencias.has(ws.pacote),
  );
}
