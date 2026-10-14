import { achado, linhasUteis } from './achados.mjs';

const CATEGORIA = 'monoliticos';
const TETO_DE_LINHAS_DO_ARQUIVO = 500;
const AVISO_DE_LINHAS_DO_ARQUIVO = 400;
const TETO_DA_FUNCAO = 20;
const TETO_DO_HOOK = 30;
const TETO_DO_COMPONENTE = 60;
const TETO_DE_COMPLEXIDADE = 10;
const TETO_DE_PROFUNDIDADE = 2;
const TETO_DE_PARAMETROS = 4;
const TETO_DE_METODOS = 10;
const TETO_DE_LINHAS_DA_CLASSE = 250;
const TETO_DE_IMPORTS = 25;
const TETO_DE_FUNCOES_EXPORTADAS = 12;

export function analisarMonoliticos(contexto) {
  const achados = [];
  for (const ficha of contexto.fichasDoAlvo()) {
    if (ficha.gerado) continue;
    achados.push(
      ...arquivoGrande(ficha),
      ...funcoesLongas(ficha),
      ...classesGrandes(ficha),
      ...acoplamentoDoArquivo(ficha),
    );
  }
  return achados;
}

function arquivoGrande(ficha) {
  const total = ficha.totalDeLinhas;
  if (total > TETO_DE_LINHAS_DO_ARQUIVO) {
    return [
      achado(
        CATEGORIA,
        'arquivo-grande',
        'aviso',
        ficha,
        1,
        `arquivo com ${total} linhas úteis (teto ${TETO_DE_LINHAS_DO_ARQUIVO})`,
        'separar por responsabilidade: uma por arquivo, nomeada pelo que faz',
      ),
    ];
  }
  if (total > AVISO_DE_LINHAS_DO_ARQUIVO) {
    return [
      achado(
        CATEGORIA,
        'arquivo-grande',
        'info',
        ficha,
        1,
        `arquivo com ${total} linhas úteis, perto do teto de ${TETO_DE_LINHAS_DO_ARQUIVO}`,
      ),
    ];
  }
  return [];
}

function tetoDaFuncao(funcao) {
  if (funcao.ehComponente) return TETO_DO_COMPONENTE;
  if (funcao.ehHook) return TETO_DO_HOOK;
  return TETO_DA_FUNCAO;
}

// O plugin que registra rotas ou eventos (`export async function
// campaignRoutes(app)`) soma o tamanho de todos os handlers anônimos de dentro:
// cinco rotas finas estourariam o teto. Cada handler é medido por si na regra
// handler-com-logica de arquitetura.mjs.
function ehPluginDeRegistro(ficha, funcao) {
  return funcao.exportada && /\.(routes|gateway)\.ts$/.test(ficha.nome);
}

function funcoesLongas(ficha) {
  if (ficha.ehTeste) return [];
  const achados = [];
  for (const funcao of ficha.funcoes) {
    if (!funcao.nome || ehPluginDeRegistro(ficha, funcao)) continue;
    const rotulo = funcao.ehComponente ? 'componente' : funcao.ehHook ? 'hook' : 'função';
    achados.push(
      ...comprimentoDaFuncao(ficha, funcao, rotulo),
      ...complexidadeDaFuncao(ficha, funcao, rotulo),
      ...profundidadeDaFuncao(ficha, funcao, rotulo),
      ...parametrosDaFuncao(ficha, funcao, rotulo),
    );
  }
  return achados;
}

function comprimentoDaFuncao(ficha, funcao, rotulo) {
  const teto = tetoDaFuncao(funcao);
  const uteis = linhasUteis(ficha, funcao.linha, funcao.linhaFim);
  if (uteis <= teto) return [];
  const severidade = uteis > teto * 2 ? 'erro' : 'aviso';
  return [
    achado(
      CATEGORIA,
      'funcao-longa',
      severidade,
      ficha,
      funcao.linha,
      `${rotulo} \`${funcao.nome}\` tem ${uteis} linhas úteis (teto ${teto})`,
      'extrair os passos com nome próprio; cada função faz uma coisa',
    ),
  ];
}

function complexidadeDaFuncao(ficha, funcao, rotulo) {
  if (funcao.complexidade <= TETO_DE_COMPLEXIDADE) return [];
  const severidade = funcao.complexidade > TETO_DE_COMPLEXIDADE * 1.5 ? 'erro' : 'aviso';
  return [
    achado(
      CATEGORIA,
      'funcao-complexa',
      severidade,
      ficha,
      funcao.linha,
      `${rotulo} \`${funcao.nome}\` tem complexidade ${funcao.complexidade} (teto ${TETO_DE_COMPLEXIDADE})`,
      'quebrar os ramos em funções menores ou trocar cadeia de if por tabela/mapa',
    ),
  ];
}

function profundidadeDaFuncao(ficha, funcao, rotulo) {
  if (funcao.profundidade <= TETO_DE_PROFUNDIDADE) return [];
  return [
    achado(
      CATEGORIA,
      'aninhamento-profundo',
      'aviso',
      ficha,
      funcao.linha,
      `${rotulo} \`${funcao.nome}\` aninha ${funcao.profundidade} níveis (teto ${TETO_DE_PROFUNDIDADE})`,
      'early return e extração do bloco interno',
    ),
  ];
}

function parametrosDaFuncao(ficha, funcao, rotulo) {
  if (funcao.parametros <= TETO_DE_PARAMETROS) return [];
  return [
    achado(
      CATEGORIA,
      'muitos-parametros',
      'info',
      ficha,
      funcao.linha,
      `${rotulo} \`${funcao.nome}\` recebe ${funcao.parametros} parâmetros (teto ${TETO_DE_PARAMETROS})`,
      'agrupar em um objeto nomeado',
    ),
  ];
}

function classesGrandes(ficha) {
  const achados = [];
  for (const classe of ficha.classes) {
    const linhas = classe.linhaFim - classe.linha + 1;
    if (classe.metodos > TETO_DE_METODOS) {
      achados.push(
        achado(
          CATEGORIA,
          'classe-grande',
          'aviso',
          ficha,
          classe.linha,
          `classe \`${classe.nome}\` tem ${classe.metodos} métodos (teto ${TETO_DE_METODOS})`,
          'dividir por caso de uso ou extrair colaboradores',
        ),
      );
    }
    if (linhas > TETO_DE_LINHAS_DA_CLASSE) {
      achados.push(
        achado(
          CATEGORIA,
          'classe-grande',
          'aviso',
          ficha,
          classe.linha,
          `classe \`${classe.nome}\` ocupa ${linhas} linhas (teto ${TETO_DE_LINHAS_DA_CLASSE})`,
        ),
      );
    }
  }
  return achados;
}

function acoplamentoDoArquivo(ficha) {
  const achados = [];
  if (ficha.imports.length > TETO_DE_IMPORTS) {
    achados.push(
      achado(
        CATEGORIA,
        'muitos-imports',
        'info',
        ficha,
        1,
        `${ficha.imports.length} imports (teto ${TETO_DE_IMPORTS}): o arquivo conhece coisa demais`,
      ),
    );
  }
  const exportadas = ficha.classes.filter((classe) => classe.exportada);
  if (exportadas.length > 1) {
    achados.push(
      achado(
        CATEGORIA,
        'responsabilidades-misturadas',
        'aviso',
        ficha,
        exportadas[1].linha,
        `${exportadas.length} classes exportadas no mesmo arquivo (${exportadas.map((c) => c.nome).join(', ')})`,
        'uma classe por arquivo, nomeado por ela',
      ),
    );
  }
  const funcoesExportadas = ficha.exports.filter((item) => item.tipo === 'function').length;
  if (funcoesExportadas > TETO_DE_FUNCOES_EXPORTADAS) {
    achados.push(
      achado(
        CATEGORIA,
        'responsabilidades-misturadas',
        'info',
        ficha,
        1,
        `${funcoesExportadas} funções exportadas do mesmo arquivo (teto ${TETO_DE_FUNCOES_EXPORTADAS})`,
        'separar por tema; cada arquivo com um assunto',
      ),
    );
  }
  return achados;
}
