// Onde o spec de um arquivo de produção mora, e vice-versa. Todo workspace
// (client, server, game-core, contracts) tem os specs em test/ espelhando
// src/. Integração do server (test/integration/) e as pastas de apoio
// (test/support/, test/setup.ts) não têm espelho por desenho.
import fs from 'node:fs';
import path from 'node:path';

const EXTENSOES = new Set(['.ts', '.tsx']);
const RAIZ_DOS_SPECS = 'test';
const APOIO = [/^test\/support\//, /^test\/setup\.tsx?$/, /^test\/integration\//];

// Produção que não pede spec próprio: entrada e barril, código gerado, fiação
// (provada pela integração) e declaração de tabela (provada pelo DAO).
const FONTES_SEM_SPEC = [
  /(^|\/)index\.tsx?$/,
  /\.d\.ts$/,
  /^src\/main\.tsx?$/,
  /^src\/generated\//,
  /^src\/components\/ui\//,
  /^src\/lib\/utils\.ts$/,
  /\.plugin\.ts$/,
  /\.po\.ts$/,
];

// DTO é forma: `z.string().min(1)` puro é testar o zod. Só pede spec o DTO
// que acrescenta regra própria ao schema.
const DTO_COM_REGRA = /\.(?:refine|superRefine|transform|check|pipe)\(/;

export function ehSpec(relativo) {
  return /\.(spec|test)\.(ts|tsx)$/.test(relativo) || /(^|\/)__tests__\//.test(relativo);
}

export function ehIntegracao(relativo) {
  return /^test\/integration\//.test(relativo);
}

export function ehApoioDeTeste(relativo) {
  return APOIO.some((padrao) => padrao.test(relativo));
}

/** Se a fonte dispensa spec espelhado (wiring, gerado, DTO sem regra própria).
 *
 *  Example: `fonteDispensaSpec('src/modules/combat/combat.plugin.ts', '') // true` */
export function fonteDispensaSpec(relativo, texto = '') {
  if (FONTES_SEM_SPEC.some((padrao) => padrao.test(relativo))) return true;
  return /\.dto\.ts$/.test(relativo) && !DTO_COM_REGRA.test(texto);
}

export function aliasDeProducao(app) {
  return app.aliases[0]?.prefixo ?? null;
}

function baseSemSufixo(nomeDoArquivo) {
  return nomeDoArquivo.replace(/\.(spec|test)\.(ts|tsx)$/, '').replace(/\.(ts|tsx)$/, '');
}

function listarFontes(pastaAbsoluta) {
  if (!fs.existsSync(pastaAbsoluta)) return [];
  return fs
    .readdirSync(pastaAbsoluta)
    .filter((arquivo) => EXTENSOES.has(path.extname(arquivo)) && !ehSpec(arquivo))
    .map((arquivo) => ({ arquivo, base: baseSemSufixo(arquivo) }));
}

function pastaDaFonteDoSpec(relativoDoSpec) {
  const pastaDoSpec = path.posix.dirname(relativoDoSpec);
  if (pastaDoSpec === RAIZ_DOS_SPECS) return 'src';
  if (!pastaDoSpec.startsWith(`${RAIZ_DOS_SPECS}/`)) return null;
  return `src/${pastaDoSpec.slice(RAIZ_DOS_SPECS.length + 1)}`;
}

// 'test/modules/x/a-without-owner.spec.ts' → a fonte 'src/modules/x/a.ts' (o
// prefixo mais longo ganha: um arquivo pode ter mais de um spec). Sem nome
// parecido, vale o primeiro import que aponte para a mesma pasta de src/.
export function fonteDoSpec(app, relativoDoSpec, importsResolvidos = []) {
  const pastaDaFonte = pastaDaFonteDoSpec(relativoDoSpec);
  if (!pastaDaFonte) return null;
  const base = baseSemSufixo(path.posix.basename(relativoDoSpec));
  const fontes = listarFontes(path.join(app.raiz, pastaDaFonte));
  const porNome = fontes
    .filter(
      (fonte) =>
        base === fonte.base ||
        base.startsWith(`${fonte.base}-`) ||
        base.startsWith(`${fonte.base}.`),
    )
    .sort((a, b) => b.base.length - a.base.length)[0];
  const porImport = fontes.find((fonte) =>
    importsResolvidos.includes(`${pastaDaFonte}/${fonte.base}`),
  );
  const escolhida = porNome ?? porImport ?? null;
  return {
    pastaDaFonte,
    canonico: `${pastaDaFonte}/${base}.ts`,
    fonte: escolhida ? `${pastaDaFonte}/${escolhida.arquivo}` : null,
    porNome: Boolean(porNome),
  };
}

// 'src/modules/x/a.ts' → os specs existentes que o espelham (pelo nome ou por
// importar o arquivo) e o caminho canônico do novo.
export function specsDaFonte(app, relativoDaFonte, importsDoSpec = () => []) {
  const pastaDaFonte = path.posix.dirname(relativoDaFonte);
  const pastaDosSpecs =
    pastaDaFonte === 'src'
      ? RAIZ_DOS_SPECS
      : `${RAIZ_DOS_SPECS}/${pastaDaFonte.slice('src/'.length)}`;
  const base = baseSemSufixo(path.posix.basename(relativoDaFonte));
  const pastaAbsoluta = path.join(app.raiz, pastaDosSpecs);
  const existentes = !fs.existsSync(pastaAbsoluta)
    ? []
    : fs
        .readdirSync(pastaAbsoluta)
        .filter((arquivo) => ehSpec(arquivo))
        .map((arquivo) => `${pastaDosSpecs}/${arquivo}`)
        .filter(
          (spec) =>
            fonteDoSpec(app, spec)?.fonte === relativoDaFonte ||
            importsDoSpec(spec).includes(semExtensao(relativoDaFonte)),
        );
  const extensao = relativoDaFonte.endsWith('.tsx') ? 'spec.tsx' : 'spec.ts';
  return { canonico: `${pastaDosSpecs}/${base}.${extensao}`, existentes };
}

// Especificador de import/mock → caminho relativo à raiz do workspace, sem
// extensão ('@/lib/x' → 'src/lib/x'; '../../src/x' → 'src/x'); null para pacote.
export function resolverEspecificador(app, relativoDoSpec, especificador) {
  const alias = app.aliases.find((item) => especificador.startsWith(item.prefixo));
  if (alias) {
    const destino = path.resolve(alias.destino, especificador.slice(alias.prefixo.length));
    return semExtensao(path.relative(app.raiz, destino));
  }
  if (!especificador.startsWith('.')) return null;
  const destino = path.resolve(app.raiz, path.posix.dirname(relativoDoSpec), especificador);
  return semExtensao(path.relative(app.raiz, destino));
}

function semExtensao(caminho) {
  return caminho
    .split(path.sep)
    .join('/')
    .replace(/\.(ts|tsx|js|mjs)$/, '');
}
