// Uma ficha por arquivo de **todos** os workspaces do monorepo: imports
// resolvidos (relativo, alias do tsconfig, `@lorkarium/<pacote>`), exports,
// funções, classes, tipos, comentários e contagem de identificadores. As regras
// ancoram no alvo, mas olham o monorepo: o export do game-core é usado pelo
// client, e o util que o server reescreve pode já existir no game-core.
import fs from 'node:fs';
import path from 'node:path';
import { paraBarras } from './ambiente.mjs';
import {
  apagarComentarios,
  apagarImports,
  coletarComentarios,
  coletarFuncoes,
  contarIdentificadores,
  decoradoresDe,
  linhaDe,
  nomeDoNo,
  textoDoJsdoc,
} from './ast.mjs';

const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', 'coverage', 'build', '.git', 'fixtures']);
const EXTENSOES = new Set(['.ts', '.tsx', '.mts']);
const TENTATIVAS_DE_RESOLUCAO = ['', '.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];

// Código que ninguém escreveu à mão: conta para referências, não para estilo.
// `src/lib/utils.ts` é o `cn` que o shadcn gera (aliases.utils do
// components.json) e que os componentes de ui/ importam.
const PADROES_GERADOS = [
  /\/src\/generated\//,
  /\/src\/components\/ui\//,
  /\/migrations\//,
  /^\/src\/lib\/utils\.ts$/,
];

// scripts/ entra porque script roda à mão e importa src/ — sem ele, o que só o
// script usa pareceria órfão.
const PASTAS_DO_APP = ['src', 'test', 'scripts'];

export function listarArquivosDoApp(raizDoApp) {
  const arquivos = [];
  for (const pasta of PASTAS_DO_APP) {
    const base = path.join(raizDoApp, pasta);
    if (fs.existsSync(base)) percorrer(base, arquivos);
  }
  for (const entrada of fs.readdirSync(raizDoApp, { withFileTypes: true })) {
    const ehFonte = entrada.isFile() && EXTENSOES.has(path.extname(entrada.name));
    if (ehFonte && !entrada.name.endsWith('.d.ts'))
      arquivos.push(path.join(raizDoApp, entrada.name));
  }
  return arquivos;
}

function percorrer(pasta, saida) {
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      if (!PASTAS_IGNORADAS.has(entrada.name)) percorrer(caminho, saida);
      continue;
    }
    if (EXTENSOES.has(path.extname(entrada.name)) && !entrada.name.endsWith('.d.ts')) {
      saida.push(caminho);
    }
  }
}

export function montarFichas(ambiente) {
  const fichas = new Map();
  for (const workspace of ambiente.workspaces) {
    for (const caminho of listarArquivosDoApp(workspace.raiz)) {
      fichas.set(caminho, montarFicha(ambiente, workspace, caminho));
    }
  }
  resolverImportacoes(ambiente, fichas);
  return fichas;
}

function montarFicha(ambiente, workspace, caminho) {
  const { ts } = ambiente;
  const texto = fs.readFileSync(caminho, 'utf8');
  const extensao = path.extname(caminho);
  const fonte = ts.createSourceFile(
    caminho,
    texto,
    ts.ScriptTarget.Latest,
    true,
    extensao === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const relativo = paraBarras(path.relative(workspace.raiz, caminho));
  const comentarios = coletarComentarios(ts, fonte);
  const textoSemComentarios = apagarComentarios(texto, comentarios);
  const ficha = {
    caminho,
    workspace,
    relativo,
    relativoAoRepo: paraBarras(path.relative(ambiente.repo, caminho)),
    nome: path.basename(caminho),
    extensao,
    texto,
    textoSemComentarios,
    textoSemImports: apagarImports(ts, fonte, textoSemComentarios),
    linhas: texto.split('\n'),
    totalDeLinhas: texto.split('\n').filter((linha) => linha.trim() !== '').length,
    gerado: PADROES_GERADOS.some((padrao) => padrao.test(`/${relativo}`)),
    ehTeste: relativo.startsWith('test/') || /\.(spec|test)\.[cm]?tsx?$/.test(caminho),
    ehEntradaDoPacote:
      workspace.entrada !== null && path.resolve(caminho) === path.resolve(workspace.entrada),
    fonte,
    comentarios,
    imports: coletarImports(ts, fonte),
    exports: coletarExports(ts, fonte),
    funcoes: coletarFuncoes(ts, fonte, extensao),
    classes: coletarClasses(ts, fonte),
    tipos: coletarTipos(ts, fonte),
    identificadores: contarIdentificadores(ts, fonte),
    importadoPor: new Set(),
  };
  ficha.decoradores = new Set(ficha.classes.flatMap((classe) => classe.decoradores));
  return ficha;
}

function coletarImports(ts, fonte) {
  const imports = [];
  const registra = (especificador, nomes, linha, ehTipo) =>
    imports.push({ especificador, nomes, linha, ehTipo, resolvido: null });
  for (const statement of fonte.statements) {
    if (ts.isImportDeclaration(statement)) {
      registra(
        statement.moduleSpecifier.text,
        nomesImportados(ts, statement.importClause),
        linhaDe(fonte, statement.getStart(fonte)),
        ehImportSoDeTipo(ts, statement.importClause),
      );
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      registra(
        statement.moduleSpecifier.text,
        [],
        linhaDe(fonte, statement.getStart(fonte)),
        statement.isTypeOnly,
      );
    }
  }
  coletarImportsDinamicos(ts, fonte, registra);
  return imports;
}

// `import type { A }` e `import { type A, type B }` não trazem nada em runtime;
// `import { type A, b }` traz `b`, então é import de valor.
function ehImportSoDeTipo(ts, clausula) {
  if (!clausula) return false;
  if (clausula.isTypeOnly) return true;
  const ligacoes = clausula.namedBindings;
  if (clausula.name || !ligacoes || !ts.isNamedImports(ligacoes)) return false;
  return ligacoes.elements.length > 0 && ligacoes.elements.every((elemento) => elemento.isTypeOnly);
}

function nomesImportados(ts, clausula) {
  if (!clausula) return [];
  const nomes = [];
  if (clausula.name) nomes.push({ local: clausula.name.text, importado: 'default' });
  const ligacoes = clausula.namedBindings;
  if (!ligacoes) return nomes;
  if (ts.isNamespaceImport(ligacoes)) {
    nomes.push({ local: ligacoes.name.text, importado: '*' });
    return nomes;
  }
  for (const elemento of ligacoes.elements) {
    nomes.push({
      local: elemento.name.text,
      importado: (elemento.propertyName ?? elemento.name).text,
      ehTipo: elemento.isTypeOnly,
    });
  }
  return nomes;
}

function coletarImportsDinamicos(ts, fonte, registra) {
  const visita = (no) => {
    if (
      ts.isCallExpression(no) &&
      no.arguments.length === 1 &&
      ts.isStringLiteral(no.arguments[0])
    ) {
      const chamada = no.expression;
      const ehImport = chamada.kind === ts.SyntaxKind.ImportKeyword;
      const ehRequire = ts.isIdentifier(chamada) && chamada.text === 'require';
      if (ehImport || ehRequire) {
        registra(no.arguments[0].text, [], linhaDe(fonte, no.getStart(fonte)), false);
      }
    }
    ts.forEachChild(no, visita);
  };
  visita(fonte);
}

function temExport(ts, statement) {
  const modificadores = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  return (modificadores ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function coletarExports(ts, fonte) {
  const exports = [];
  for (const statement of fonte.statements) {
    if (ts.isExportDeclaration(statement)) {
      registrarReexports(ts, fonte, statement, exports);
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      exports.push(descreverExport(ts, fonte, statement, 'default', 'default'));
      continue;
    }
    if (!temExport(ts, statement)) continue;
    registrarDeclaracaoExportada(ts, fonte, statement, exports);
  }
  return exports;
}

function registrarReexports(ts, fonte, statement, exports) {
  const clausula = statement.exportClause;
  if (!clausula || !ts.isNamedExports(clausula)) {
    exports.push(descreverExport(ts, fonte, statement, '*', 'reexport'));
    return;
  }
  for (const elemento of clausula.elements) {
    exports.push(descreverExport(ts, fonte, statement, elemento.name.text, 'reexport'));
  }
}

function registrarDeclaracaoExportada(ts, fonte, statement, exports) {
  const ehDefault = (ts.getModifiers(statement) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
  );
  if (ts.isVariableStatement(statement)) {
    for (const declaracao of statement.declarationList.declarations) {
      const nome = nomeDoNo(ts, declaracao.name);
      if (nome) exports.push(descreverExport(ts, fonte, statement, nome, 'const', declaracao));
    }
    return;
  }
  const tipo = tipoDaDeclaracao(ts, statement);
  if (!tipo) return;
  const nome = ehDefault ? 'default' : (nomeDoNo(ts, statement.name) ?? 'default');
  exports.push(descreverExport(ts, fonte, statement, nome, tipo));
}

function tipoDaDeclaracao(ts, statement) {
  if (ts.isFunctionDeclaration(statement)) return 'function';
  if (ts.isClassDeclaration(statement)) return 'class';
  if (ts.isInterfaceDeclaration(statement)) return 'interface';
  if (ts.isTypeAliasDeclaration(statement)) return 'type';
  if (ts.isEnumDeclaration(statement)) return 'enum';
  return null;
}

function descreverExport(ts, fonte, statement, nome, tipo, declaracao) {
  const jsdoc = textoDoJsdoc(ts, statement);
  const inicializador = declaracao?.initializer;
  const ehFuncaoConst =
    Boolean(inicializador) &&
    (ts.isArrowFunction(inicializador) || ts.isFunctionExpression(inicializador));
  return {
    nome,
    tipo: ehFuncaoConst ? 'function' : tipo,
    linha: linhaDe(fonte, statement.getStart(fonte)),
    temJsdoc: jsdoc !== null,
    jsdocTemExemplo: jsdoc !== null && /exemplo|example/i.test(jsdoc),
  };
}

function coletarClasses(ts, fonte) {
  const classes = [];
  const visita = (no) => {
    if (ts.isClassDeclaration(no)) classes.push(descreverClasse(ts, fonte, no));
    ts.forEachChild(no, visita);
  };
  visita(fonte);
  return classes;
}

function ehPrivado(ts, membro) {
  if (membro.name && ts.isPrivateIdentifier(membro.name)) return true;
  return (ts.getModifiers(membro) ?? []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword);
}

function descreverClasse(ts, fonte, no) {
  const membros = no.members.map((membro) => ({
    nome: nomeDoNo(ts, membro.name),
    linha: linhaDe(fonte, membro.getStart(fonte)),
    ehMetodo: ts.isMethodDeclaration(membro),
    ehPropriedade: ts.isPropertyDeclaration(membro),
    privado: ehPrivado(ts, membro),
    somenteLeitura: (ts.getModifiers(membro) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword,
    ),
    ehSetter: ts.isSetAccessorDeclaration(membro),
    decoradores: decoradoresDe(ts, membro),
  }));
  const parametrosDoConstrutor =
    no.members.find((m) => ts.isConstructorDeclaration(m))?.parameters ?? [];
  const parametrosPrivados = parametrosDoConstrutor
    .filter((p) => (ts.getModifiers(p) ?? []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword))
    .map((p) => ({
      nome: nomeDoNo(ts, p.name),
      linha: linhaDe(fonte, p.getStart(fonte)),
      privado: true,
    }));
  const modificadores = ts.getModifiers(no) ?? [];
  return {
    nome: nomeDoNo(ts, no.name) ?? '(anônima)',
    linha: linhaDe(fonte, no.getStart(fonte)),
    linhaFim: linhaDe(fonte, no.end),
    abstrata: modificadores.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword),
    exportada: modificadores.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
    implementa: (no.heritageClauses ?? [])
      .filter((clausula) => clausula.token === ts.SyntaxKind.ImplementsKeyword)
      .flatMap((clausula) => clausula.types.map((tipo) => tipo.expression.getText(fonte))),
    decoradores: decoradoresDe(ts, no),
    membros: [...membros, ...parametrosPrivados],
    metodos: membros.filter((m) => m.ehMetodo).length,
  };
}

function coletarTipos(ts, fonte) {
  const tipos = [];
  const registra = (nome, membros, no) => {
    const nomes = membros
      .map((m) => nomeDoNo(ts, m.name))
      .filter(Boolean)
      .sort();
    if (nomes.length >= 3)
      tipos.push({ nome, membros: nomes, linha: linhaDe(fonte, no.getStart(fonte)) });
  };
  const visita = (no) => {
    if (ts.isInterfaceDeclaration(no)) registra(no.name.text, no.members, no);
    if (ts.isTypeAliasDeclaration(no) && ts.isTypeLiteralNode(no.type))
      registra(no.name.text, no.type.members, no);
    ts.forEachChild(no, visita);
  };
  visita(fonte);
  return tipos;
}

function resolverImportacoes(ambiente, fichas) {
  for (const ficha of fichas.values()) {
    for (const importacao of ficha.imports) {
      const destino = resolverEspecificador(ambiente, ficha, importacao.especificador, fichas);
      importacao.resolvido = destino;
      if (destino) fichas.get(destino).importadoPor.add(ficha.caminho);
    }
  }
}

function resolverEspecificador(ambiente, ficha, especificador, fichas) {
  const base = caminhoBase(ambiente, ficha, especificador);
  if (!base) return null;
  const semJs = base.replace(/\.js$/, '');
  for (const sufixo of TENTATIVAS_DE_RESOLUCAO) {
    const candidato = path.normalize(semJs + sufixo);
    if (fichas.has(candidato)) return candidato;
  }
  return null;
}

function caminhoBase(ambiente, ficha, especificador) {
  if (especificador.startsWith('.'))
    return path.resolve(path.dirname(ficha.caminho), especificador);
  for (const alias of ficha.workspace.aliases) {
    if (especificador.startsWith(alias.prefixo)) {
      return path.join(alias.destino, especificador.slice(alias.prefixo.length));
    }
  }
  return caminhoDeOutroWorkspace(ambiente, especificador);
}

// `@lorkarium/game-core` → a entrada do pacote; `@lorkarium/game-core/src/x`
// → o arquivo de dentro (é import profundo, e a regra de arquitetura cobra).
function caminhoDeOutroWorkspace(ambiente, especificador) {
  for (const workspace of ambiente.workspaces) {
    if (especificador === workspace.pacote) return workspace.entrada;
    if (especificador.startsWith(`${workspace.pacote}/`)) {
      return path.join(workspace.raiz, especificador.slice(workspace.pacote.length + 1));
    }
  }
  return null;
}
