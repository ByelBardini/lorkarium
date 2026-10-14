import { achado } from './achados.mjs';
import { linhaDe, nomeDoNo } from './ast.mjs';
import { ehExportDeRota } from './codigo-morto.mjs';

const NOMES = 'nomes';
const COMENTARIOS = 'comentarios';
const TETO_DE_ANY_POR_ARQUIVO = 5;
const TETO_DE_NUMEROS_POR_ARQUIVO = 5;

// O código do Lorkarium é em inglês: `data` é o genérico que o CLAUDE.md proíbe.
const NOMES_PROIBIDOS = new Set([
  'data',
  'handler',
  'manager',
  'helper',
  'util',
  'utils',
  'foo',
  'bar',
  'baz',
  'tmp',
  'temp',
  'stuff',
  'misc',
  'aux',
  'obj',
  'arr',
  'lst',
  'thing',
  'things',
]);
const SUFIXOS_PROIBIDOS = /(?:Handler|Manager|Helper|Utils?|Obj|Tmp|Temp)$/;
// `tokenData`, `sceneInfo`: o sufixo não diz nada que o prefixo já não dissesse.
const SUFIXOS_VAGOS = /[a-z](?:Data|Info|Stuff)$/;
const NOMES_VAGOS = new Set([
  'item',
  'items',
  'value',
  'values',
  'result',
  'results',
  'res',
  'ret',
  'list',
  'info',
  'val',
  'object',
  'flag',
  'str',
  'num',
  'dados',
  'resultado',
  'retorno',
  'lista',
]);
// Geometria e comparador têm nome curto por convenção: `(a, b) => b - a`,
// `distance(ax, ay, bx, by)`, `dx`/`dy` de um arraste.
const CURTOS_ACEITOS = new Set([
  '_',
  'a',
  'b',
  'i',
  'j',
  'k',
  'x',
  'y',
  'z',
  'id',
  'ip',
  'db',
  'fs',
  'os',
  'ts',
  'ok',
  'ms',
  'px',
  'ui',
  'io',
  'tx',
  'dx',
  'dy',
  'ax',
  'ay',
  'bx',
  'by',
  'cx',
  'cy',
  'vx',
  'vy',
  'x0',
  'y0',
  'x1',
  'y1',
  'hp',
  'to',
  'on',
  'up',
  'ws',
]);
const ERROS_SEM_ECO = /^(Unauthorized|Forbidden)(Error|Exception)$/;
const NUMEROS_TRIVIAIS = new Set(['0', '1', '2', '10', '100', '1000']);

const VERBO_NARRADOR =
  /^(Cria|Retorna|Pega|Busca|Seta|Define|Chama|Verifica|Checa|Incrementa|Adiciona|Remove|Monta|Converte|Faz|Itera|Percorre|Salva|Atualiza|Inicializa|Declara|Importa|Calcula|Formata|Valida|Limpa|Configura|Instancia|Executa|Renderiza|Mapeia|Filtra|Ordena|Envia|Lê|Le|Escreve|Abre|Fecha|Zera|Soma|Conta|Obtém|Obtem|Gera|Devolve|Loop|Aqui|Returns?|Creates?|Gets?|Sets?|Checks?|Loops?|Increments?|Adds?|Removes?|Calls?|Initializes?|Updates?|Builds?|Iterates?|Maps?|Filters?|Sorts?|Sends?|Reads?|Writes?|Opens?|Closes?|Computes?|Calculates?|Formats?|Validates?|Cleans?|Configures?|Renders?|Fetch(?:es)?|Parses?|Converts?|Handles?)\b/i;
const SINAL_DE_PORQUE =
  /porque|pois|senão|para que|para não|por isso|se não|caso contrário|sem isso|de propósito|why|because|since|so that|otherwise|:|—|§/i;
const DIRETIVA = /^(eslint|@ts-|prettier|biome|c8|istanbul|v8|@vitest|@jest|https?:)/;
const SEPARADOR_DE_SECAO = /^[-=*#]{3,}|^#+\s|^={2,}\s*\w[\w ]*\s*={2,}$/;

export function analisarNomes(contexto) {
  const achados = [];
  const pastasVistas = new Set();
  for (const ficha of contexto.fichasDoAlvo()) {
    if (ficha.gerado) continue;
    achados.push(
      ...nomesDeclarados(contexto, ficha),
      ...nomeDoArquivo(ficha, pastasVistas),
      ...anyExplicito(contexto, ficha),
      ...supressoesDeTipo(ficha),
      ...exportsSemTipoDeRetorno(ficha),
      ...docstringsDosExports(ficha),
      ...numerosMagicos(contexto, ficha),
      ...mensagensDeErroSemValor(contexto, ficha),
      ...elseDepoisDeReturn(contexto, ficha),
      ...ternariosAninhados(contexto, ficha),
    );
  }
  return achados;
}

export function analisarComentarios(contexto) {
  const achados = [];
  for (const ficha of contexto.fichasDoAlvo()) {
    if (ficha.gerado || ficha.ehTeste) continue;
    achados.push(...comentariosQueNarram(ficha), ...separadoresDeSecao(ficha));
  }
  return achados;
}

function declaracoesDe(ts, ficha) {
  const declaracoes = [];
  const registra = (no, tipo) => {
    const nome = nomeDoNo(ts, no.name);
    if (nome)
      declaracoes.push({ nome, tipo, linha: linhaDe(ficha.fonte, no.getStart(ficha.fonte)), no });
  };
  const visita = (no) => {
    if (ts.isVariableDeclaration(no) || ts.isBindingElement(no)) registra(no, 'variável');
    else if (ts.isParameter(no)) registra(no, 'parâmetro');
    else if (ts.isFunctionDeclaration(no)) registra(no, 'função');
    else if (ts.isClassDeclaration(no)) registra(no, 'classe');
    else if (ts.isMethodDeclaration(no)) registra(no, 'método');
    else if (ts.isPropertyDeclaration(no)) registra(no, 'propriedade');
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return declaracoes;
}

function nomesDeclarados(contexto, ficha) {
  const achados = [];
  for (const declaracao of declaracoesDe(contexto.ts, ficha)) {
    const { nome, tipo, linha } = declaracao;
    const minusculo = nome.toLowerCase();
    if (NOMES_PROIBIDOS.has(minusculo) || SUFIXOS_PROIBIDOS.test(nome)) {
      achados.push(
        achado(
          NOMES,
          'nome-generico',
          'aviso',
          ficha,
          linha,
          `${tipo} \`${nome}\`: nome genérico que não diz o que é`,
          'nomear pelo conteúdo (o que é, não o papel técnico)',
        ),
      );
      continue;
    }
    if (NOMES_VAGOS.has(minusculo) || SUFIXOS_VAGOS.test(nome)) {
      achados.push(
        achado(
          NOMES,
          'nome-vago',
          'info',
          ficha,
          linha,
          `${tipo} \`${nome}\` é vago; qual ${tipo}?`,
        ),
      );
      continue;
    }
    if (nome.length <= 2 && !CURTOS_ACEITOS.has(nome)) {
      achados.push(
        achado(
          NOMES,
          'nome-curto',
          'info',
          ficha,
          linha,
          `${tipo} \`${nome}\` com ${nome.length} letra(s)`,
        ),
      );
    }
  }
  return achados;
}

function ehKebab(segmento) {
  const limpo = segmento.replace(/^[[(@~_]|[\])]$|\.{3}/g, '');
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(limpo);
}

function nomeDoArquivo(ficha, pastasVistas) {
  const achados = [];
  const base = ficha.nome.replace(/\.(ts|tsx|mts)$/, '');
  if (!ehKebab(base)) {
    achados.push(
      achado(
        NOMES,
        'arquivo-fora-do-kebab-case',
        'aviso',
        ficha,
        1,
        `nome de arquivo \`${ficha.nome}\` fora do kebab-case`,
      ),
    );
  }
  const pastas = ficha.relativo.split('/').slice(0, -1);
  pastas.forEach((pasta, indice) => {
    const caminho = pastas.slice(0, indice + 1).join('/');
    if (pastasVistas.has(caminho) || ehKebab(pasta)) return;
    pastasVistas.add(caminho);
    achados.push(
      achado(
        NOMES,
        'pasta-fora-do-kebab-case',
        'aviso',
        ficha,
        1,
        `pasta \`${caminho}\` fora do kebab-case`,
      ),
    );
  });
  return achados;
}

function anyExplicito(contexto, ficha) {
  const { ts } = contexto;
  const linhas = [];
  const visita = (no) => {
    if (no.kind === ts.SyntaxKind.AnyKeyword)
      linhas.push(linhaDe(ficha.fonte, no.getStart(ficha.fonte)));
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return linhas
    .slice(0, TETO_DE_ANY_POR_ARQUIVO)
    .map((linha) =>
      achado(
        NOMES,
        'any-explicito',
        'aviso',
        ficha,
        linha,
        `\`any\` explícito${linhas.length > TETO_DE_ANY_POR_ARQUIVO ? ` (${linhas.length} no arquivo)` : ''}`,
        'tipar; `unknown` + narrowing quando o formato é externo',
      ),
    );
}

function supressoesDeTipo(ficha) {
  return ficha.comentarios
    .filter((c) => /@ts-ignore|@ts-expect-error|eslint-disable/.test(c.texto))
    .map((c) =>
      achado(
        NOMES,
        'supressao-de-lint-ou-tipo',
        'info',
        ficha,
        c.linha,
        `supressão: \`${c.texto.slice(0, 70)}\``,
        'resolver a causa em vez de calar a ferramenta',
      ),
    );
}

function exportsSemTipoDeRetorno(ficha) {
  if (ficha.ehTeste) return [];
  return ficha.funcoes
    .filter((f) => f.exportada && !f.temTipoDeRetorno && !f.ehComponente && !f.ehMetodo)
    .filter((f) => !ehExportDeRota(ficha, f.nome))
    .map((f) =>
      achado(
        NOMES,
        'export-sem-tipo-de-retorno',
        'aviso',
        ficha,
        f.linha,
        `\`${f.nome}\` é pública e não declara o tipo de retorno`,
      ),
    );
}

function docstringsDosExports(ficha) {
  if (ficha.ehTeste) return [];
  const achados = [];
  for (const item of ficha.exports) {
    if (item.tipo !== 'function') continue;
    if (ehExportDeRota(ficha, item.nome)) continue;
    if (!item.temJsdoc) {
      achados.push(
        achado(
          COMENTARIOS,
          'export-sem-docstring',
          'info',
          ficha,
          item.linha,
          `\`${item.nome}\` é pública e não tem docstring (intenção + um exemplo de uso)`,
        ),
      );
    } else if (!item.jsdocTemExemplo) {
      achados.push(
        achado(
          COMENTARIOS,
          'docstring-sem-exemplo',
          'info',
          ficha,
          item.linha,
          `docstring de \`${item.nome}\` sem a linha \`Example:\` (ou @example)`,
        ),
      );
    }
  }
  return achados;
}

function dentroDeConstDeModulo(ts, no) {
  let atual = no.parent;
  while (atual) {
    if (ts.isVariableStatement(atual)) return ts.isSourceFile(atual.parent);
    if (ts.isEnumMember(atual) || ts.isJsxAttribute(atual)) return true;
    if (ts.isFunctionLike(atual)) return false;
    atual = atual.parent;
  }
  return false;
}

function numerosMagicos(contexto, ficha) {
  if (ficha.ehTeste) return [];
  const { ts } = contexto;
  const achados = [];
  const visita = (no) => {
    if (
      achados.length < TETO_DE_NUMEROS_POR_ARQUIVO &&
      ts.isNumericLiteral(no) &&
      ehMagico(ts, no)
    ) {
      achados.push(
        achado(
          NOMES,
          'numero-magico',
          'info',
          ficha,
          linhaDe(ficha.fonte, no.getStart(ficha.fonte)),
          `número \`${no.text}\` solto no código`,
          'const com nome que diga o que ele é',
        ),
      );
    }
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function ehMagico(ts, no) {
  if (NUMEROS_TRIVIAIS.has(no.text)) return false;
  const valor = Number(no.text);
  if (Number.isInteger(valor) && Math.abs(valor) < 100) return false;
  if (dentroDeConstDeModulo(ts, no)) return false;
  const pai = no.parent;
  if (pai && ts.isElementAccessExpression(pai)) return false;
  if (pai && ts.isCallExpression(pai) && ts.isPropertyAccessExpression(pai.expression)) {
    const metodo = pai.expression.name.text;
    if (/^(slice|substring|substr|padStart|padEnd|toFixed|at|charAt|repeat)$/.test(metodo))
      return false;
  }
  return !(pai && ts.isNewExpression(pai) && pai.expression.getText() === 'Date');
}

function mensagensDeErroSemValor(contexto, ficha) {
  if (ficha.ehTeste) return [];
  const { ts } = contexto;
  const achados = [];
  const visita = (no) => {
    if (
      ts.isNewExpression(no) &&
      /(Error|Exception)$/.test(no.expression.getText()) &&
      !ERROS_SEM_ECO.test(no.expression.getText())
    ) {
      const primeiro = no.arguments?.[0];
      const semValor =
        !primeiro || ts.isStringLiteral(primeiro) || ts.isNoSubstitutionTemplateLiteral(primeiro);
      if (semValor) {
        achados.push(
          achado(
            NOMES,
            'mensagem-de-erro-sem-valor',
            'info',
            ficha,
            linhaDe(ficha.fonte, no.getStart(ficha.fonte)),
            `\`new ${no.expression.getText()}\` com mensagem fixa, sem o valor ofensivo nem a forma esperada`,
          ),
        );
      }
    }
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function terminaEncerrando(ts, statement) {
  const ultimo = ts.isBlock(statement) ? statement.statements.at(-1) : statement;
  return (
    Boolean(ultimo) &&
    (ts.isReturnStatement(ultimo) ||
      ts.isThrowStatement(ultimo) ||
      ts.isContinueStatement(ultimo) ||
      ts.isBreakStatement(ultimo))
  );
}

function elseDepoisDeReturn(contexto, ficha) {
  const { ts } = contexto;
  const achados = [];
  const visita = (no) => {
    if (ts.isIfStatement(no) && no.elseStatement && terminaEncerrando(ts, no.thenStatement)) {
      achados.push(
        achado(
          NOMES,
          'else-depois-de-return',
          'info',
          ficha,
          linhaDe(ficha.fonte, no.getStart(ficha.fonte)),
          '`else` depois de um ramo que já retorna',
          'early return: tirar o else e desindentar',
        ),
      );
    }
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function ternariosAninhados(contexto, ficha) {
  const { ts } = contexto;
  const achados = [];
  const semParenteses = (no) =>
    ts.isParenthesizedExpression(no) ? semParenteses(no.expression) : no;
  const visita = (no) => {
    if (ts.isConditionalExpression(no)) {
      const ramos = [semParenteses(no.whenTrue), semParenteses(no.whenFalse)];
      if (ramos.some((ramo) => ts.isConditionalExpression(ramo))) {
        achados.push(
          achado(
            NOMES,
            'ternario-aninhado',
            'info',
            ficha,
            linhaDe(ficha.fonte, no.getStart(ficha.fonte)),
            'ternário dentro de ternário',
            'if com early return ou um mapa',
          ),
        );
      }
    }
    ts.forEachChild(no, visita);
  };
  visita(ficha.fonte);
  return achados;
}

function palavrasDe(texto) {
  return new Set(
    texto
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-zà-ú0-9]+/)
      .filter((palavra) => palavra.length >= 4),
  );
}

function proximaLinhaDeCodigo(ficha, linha) {
  for (let indice = linha; indice < ficha.linhas.length; indice += 1) {
    const candidata = ficha.linhas[indice].trim();
    if (candidata === '') continue;
    return candidata.startsWith('//') ? null : candidata;
  }
  return null;
}

function comentarioIsolado(ficha, comentario) {
  const anterior = ficha.linhas[comentario.linha - 2]?.trim() ?? '';
  const seguinte = ficha.linhas[comentario.linha]?.trim() ?? '';
  return !anterior.startsWith('//') && !seguinte.startsWith('//');
}

function comentariosQueNarram(ficha) {
  const achados = [];
  for (const comentario of ficha.comentarios) {
    if (
      comentario.tipo !== 'linha' ||
      DIRETIVA.test(comentario.texto) ||
      !comentarioIsolado(ficha, comentario)
    )
      continue;
    if (comentario.texto.length > 90 || SINAL_DE_PORQUE.test(comentario.texto)) continue;
    const codigo = proximaLinhaDeCodigo(ficha, comentario.linha);
    if (!codigo) continue;
    const narra = VERBO_NARRADOR.test(comentario.texto);
    const palavrasDoCodigo = palavrasDe(codigo);
    const repetidas = [...palavrasDe(comentario.texto)].filter((palavra) =>
      palavrasDoCodigo.has(palavra),
    );
    if (!narra && repetidas.length < 2) continue;
    const motivo = narra
      ? 'narra o que o código faz'
      : `repete o código (${repetidas.slice(0, 3).join(', ')})`;
    achados.push(
      achado(
        COMENTARIOS,
        'comentario-o-que',
        'info',
        ficha,
        comentario.linha,
        `comentário ${motivo}: \`${comentario.texto.slice(0, 60)}\``,
        'apagar, ou trocar pelo porquê',
      ),
    );
  }
  return achados;
}

function separadoresDeSecao(ficha) {
  return ficha.comentarios
    .filter((c) => c.tipo === 'linha' && SEPARADOR_DE_SECAO.test(c.texto))
    .map((c) =>
      achado(
        COMENTARIOS,
        'comentario-de-secao',
        'info',
        ficha,
        c.linha,
        `separador de seção \`${c.texto.slice(0, 40)}\``,
        'seção comentada costuma ser arquivo querendo virar dois',
      ),
    );
}
