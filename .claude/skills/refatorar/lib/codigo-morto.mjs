import { achado } from './achados.mjs';

const CATEGORIA = 'codigo-morto';

const ENTRADAS_DO_SERVER = /^src\/(index|main)\.ts$/;
const ENTRADAS_DO_CLIENT = /^src\/main\.tsx?$/;
// Exports que o React Router lê por convenção num módulo de rota.
const EXPORTS_DE_ROTA = new Set([
  'default',
  'loader',
  'action',
  'clientLoader',
  'clientAction',
  'ErrorBoundary',
  'HydrateFallback',
  'meta',
  'links',
  'handle',
  'shouldRevalidate',
  'headers',
  'Component',
  'Layout',
]);
const DIRETIVAS_DE_COMENTARIO =
  /^(eslint|@ts-|prettier|biome|c8|istanbul|v8|@vitest|@jest|https?:)/;
const CARA_DE_CODIGO =
  /^(const|let|var|return|import|export|if|for|while|switch|await|throw|else|try|catch)\b|=>|;\s*$|\{\s*$|^\}\)?;?$|^\w+\([^)]*\);?$/;
const MARCADOR_PENDENTE = /\b(TODO|FIXME|XXX|HACK)\b/;

export function analisarCodigoMorto(contexto) {
  const achados = [];
  for (const ficha of contexto.fichasDoAlvo()) {
    if (ficha.gerado) continue;
    achados.push(
      ...exportsSemUso(contexto, ficha),
      ...arquivoOrfao(contexto, ficha),
      ...importsSemUso(ficha),
      ...membrosPrivadosSemUso(ficha),
      ...codigoComentado(ficha),
      ...codigoInalcancavel(contexto, ficha),
      ...marcadoresPendentes(ficha),
    );
  }
  return achados;
}

export function ehPontoDeEntrada(ficha) {
  if (ficha.ehTeste || ficha.ehEntradaDoPacote) return true;
  const { tipo } = ficha.workspace;
  if (tipo === 'server' && ENTRADAS_DO_SERVER.test(ficha.relativo)) return true;
  if (tipo === 'client' && ENTRADAS_DO_CLIENT.test(ficha.relativo)) return true;
  return !ficha.relativo.startsWith('src/') && !ficha.relativo.startsWith('test/');
}

export function ehExportDeRota(ficha, nome) {
  return (
    ficha.workspace.tipo === 'client' &&
    ficha.relativo.startsWith('src/app/') &&
    EXPORTS_DE_ROTA.has(nome)
  );
}

function exportsSemUso(contexto, ficha) {
  if (ehPontoDeEntrada(ficha)) return [];
  const achados = [];
  for (const item of ficha.exports) {
    if (item.nome === 'default' || item.nome === '*' || item.tipo === 'reexport') continue;
    if (ehExportDeRota(ficha, item.nome)) continue;
    const usos = quemUsa(contexto, ficha, item.nome);
    if (usos.producao.length > 0) continue;
    if (usos.teste.length > 0) {
      achados.push(
        achado(
          CATEGORIA,
          'export-usado-so-em-teste',
          'info',
          ficha,
          item.linha,
          `\`${item.nome}\` só é referenciado em teste (${usos.teste.slice(0, 2).join(', ')})`,
          'se existe só para o spec, o spec deveria testar pelo comportamento público',
        ),
      );
      continue;
    }
    const usosInternos = (ficha.identificadores.get(item.nome) ?? 0) - 1;
    // Tipo exportado e usado na assinatura de uma função pública é superfície
    // da API, mesmo que ninguém o importe pelo nome.
    if (usosInternos > 0 && (item.tipo === 'type' || item.tipo === 'interface')) continue;
    achados.push(descreverExportSemUso(ficha, item, usosInternos, usos.soNaEntrada));
  }
  return achados;
}

function descreverExportSemUso(ficha, item, usosInternos, soNaEntrada) {
  if (soNaEntrada) {
    return achado(
      CATEGORIA,
      'export-sem-uso',
      'aviso',
      ficha,
      item.linha,
      `\`${item.nome}\` é exportado pela entrada de ${ficha.workspace.pacote} e nenhum workspace usa`,
      'tirar da entrada (e apagar, se nada interno usa); API pública nasce quando o primeiro consumidor precisa',
    );
  }
  const detalhe =
    usosInternos > 0
      ? `usado só dentro do próprio arquivo (${usosInternos}x)`
      : 'sem nenhuma referência';
  return achado(
    CATEGORIA,
    'export-sem-uso',
    'aviso',
    ficha,
    item.linha,
    `\`${item.nome}\` é exportado mas ${detalhe}`,
    usosInternos > 0 ? 'tirar o export' : 'apagar',
  );
}

// A entrada do pacote que só re-exporta o nome não é uso: sem esta exceção,
// todo export do game-core pareceria vivo por estar no index.ts. O
// `export * from './x'` não cita o nome, então vale também "a entrada importa
// este arquivo".
function quemUsa(contexto, ficha, nome) {
  const producao = [];
  const teste = [];
  let soNaEntrada = [...ficha.importadoPor].some(
    (caminho) => contexto.fichas.get(caminho).ehEntradaDoPacote,
  );
  for (const outra of contexto.fichas.values()) {
    if (outra === ficha || !outra.identificadores.has(nome)) continue;
    if (outra.ehEntradaDoPacote && outra.workspace === ficha.workspace) {
      soNaEntrada = true;
      continue;
    }
    (outra.ehTeste ? teste : producao).push(outra.relativoAoRepo);
  }
  return { producao, teste, soNaEntrada };
}

function arquivoOrfao(contexto, ficha) {
  if (ehPontoDeEntrada(ficha) || ficha.importadoPor.size > 0) return [];
  const referenciadoPorNome = [...contexto.fichas.values()].some(
    (outra) => outra !== ficha && outra.texto.includes(ficha.nome.replace(/\.(ts|tsx|mts)$/, '')),
  );
  if (referenciadoPorNome) return [];
  return [
    achado(
      CATEGORIA,
      'arquivo-orfao',
      'aviso',
      ficha,
      1,
      'nenhum arquivo do monorepo importa este; se não é ponto de entrada, é código morto',
      'confirmar com grep pelo nome do arquivo e apagar',
    ),
  ];
}

function importsSemUso(ficha) {
  const achados = [];
  for (const importacao of ficha.imports) {
    for (const nome of importacao.nomes) {
      if ((ficha.identificadores.get(nome.local) ?? 0) > 1) continue;
      achados.push(
        achado(
          CATEGORIA,
          'import-sem-uso',
          'info',
          ficha,
          importacao.linha,
          `\`${nome.local}\` importado de ${importacao.especificador} e nunca usado`,
        ),
      );
    }
  }
  return achados;
}

function membrosPrivadosSemUso(ficha) {
  const achados = [];
  for (const classe of ficha.classes) {
    for (const membro of classe.membros) {
      if (!membro.privado || !membro.nome) continue;
      if ((ficha.identificadores.get(membro.nome) ?? 0) > 1) continue;
      achados.push(
        achado(
          CATEGORIA,
          'membro-privado-sem-uso',
          'aviso',
          ficha,
          membro.linha,
          `\`${classe.nome}.${membro.nome}\` é privado e nunca lido`,
          'apagar',
        ),
      );
    }
  }
  return achados;
}

function codigoComentado(ficha) {
  const linhasDeCodigo = ficha.comentarios.filter(
    (c) =>
      c.tipo === 'linha' && !DIRETIVAS_DE_COMENTARIO.test(c.texto) && CARA_DE_CODIGO.test(c.texto),
  );
  const achados = [];
  let grupo = [];
  const fecharGrupo = () => {
    const forte =
      grupo.length === 1 && /;\s*$|^(const|let|return|import|export)\b/.test(grupo[0].texto);
    if (grupo.length >= 2 || forte) {
      achados.push(
        achado(
          CATEGORIA,
          'codigo-comentado',
          'info',
          ficha,
          grupo[0].linha,
          `${grupo.length} linha(s) de código comentado: \`${grupo[0].texto.slice(0, 60)}\``,
          'código comentado é código morto; o git guarda a história',
        ),
      );
    }
    grupo = [];
  };
  for (const comentario of linhasDeCodigo) {
    const anterior = grupo.at(-1);
    if (anterior && comentario.linha !== anterior.linha + 1) fecharGrupo();
    grupo.push(comentario);
  }
  if (grupo.length > 0) fecharGrupo();
  return achados;
}

function codigoInalcancavel(contexto, ficha) {
  const { ts } = contexto;
  const achados = [];
  const encerra = (no) =>
    ts.isReturnStatement(no) ||
    ts.isThrowStatement(no) ||
    ts.isContinueStatement(no) ||
    ts.isBreakStatement(no);
  const inspecionar = (statements) => {
    const indice = statements.findIndex(encerra);
    if (indice === -1) return;
    const seguinte = statements.slice(indice + 1).find((s) => !ts.isFunctionDeclaration(s));
    if (!seguinte) return;
    const linha =
      ficha.fonte.getLineAndCharacterOfPosition(seguinte.getStart(ficha.fonte)).line + 1;
    achados.push(
      achado(
        CATEGORIA,
        'codigo-inalcancavel',
        'erro',
        ficha,
        linha,
        'instrução depois de return/throw nunca roda',
        'apagar',
      ),
    );
  };
  const visita = (no) => {
    if (ts.isBlock(no) || ts.isCaseClause(no) || ts.isDefaultClause(no))
      inspecionar([...no.statements]);
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function marcadoresPendentes(ficha) {
  return ficha.comentarios
    .filter((c) => MARCADOR_PENDENTE.test(c.texto))
    .map((c) =>
      achado(
        CATEGORIA,
        'marcador-pendente',
        'info',
        ficha,
        c.linha,
        `marcador ${c.texto.match(MARCADOR_PENDENTE)[1]}: \`${c.texto.slice(0, 80)}\``,
      ),
    );
}
