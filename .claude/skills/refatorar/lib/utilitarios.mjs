// Lógica genérica escrita à mão onde já existe (ou deveria existir) um lugar
// central. No Lorkarium o lugar central é duplo: o src/lib/ do próprio
// workspace para o genérico, e os pacotes de que ele depende (game-core para
// regra de jogo, contracts para forma de dado) para o que é do domínio.
import { achado } from './achados.mjs';
import { dependenciasDoWorkspace } from './ambiente.mjs';

const CATEGORIA = 'utilitarios';
const TETO_DE_LINHAS_DA_CANDIDATA = 40;
const TETO_POR_ARQUIVO_EM_COMPONENTE = 3;

// Sinais de lógica genérica, por tema: [rótulo, regex, especializado]. Só o
// especializado entra em "existente ignorado" e "repetido": `new Date(` e
// `Math.floor` aparecem em todo lugar e sozinhos não dizem nada.
const TEMAS = [
  {
    tema: 'grid e coordenadas',
    marcadores: [
      ['tamanho de célula (gridSize/cellSize)', /\b(?:gridSize|cellSize|tileSize)\b/g, true],
      ['distância (Math.hypot/sqrt)', /\bMath\.(?:hypot|sqrt)\(/g, true],
      ['ângulo (Math.atan2)', /\bMath\.atan2\(/g, true],
      [
        'mundo↔tela (zoom/escala da câmera)',
        /\b(?:zoom|scale)\s*[*/]|[*/]\s*(?:zoom|scale)\b/g,
        true,
      ],
    ],
  },
  {
    tema: 'datas',
    marcadores: [
      ['new Date(', /\bnew Date\(/g, false],
      ['toISOString', /\.toISOString\(/g, true],
      ['toLocaleDateString', /\.toLocale(?:Date|Time)?String\(/g, true],
      ['Intl.DateTimeFormat', /\bIntl\.DateTimeFormat\b/g, true],
      ['set/get de data', /\.(?:set|get)(?:UTC)?(?:Date|Month|FullYear|Hours|Day)\(/g, false],
    ],
  },
  {
    tema: 'números',
    marcadores: [
      ['Intl.NumberFormat', /\bIntl\.NumberFormat\b/g, true],
      ['toFixed', /\.toFixed\(/g, true],
      [
        'clamp (Math.min(Math.max…))',
        /\bMath\.min\(\s*Math\.max\(|\bMath\.max\(\s*Math\.min\(/g,
        true,
      ],
      ['Math.round/floor/ceil', /\bMath\.(?:round|floor|ceil|trunc)\(/g, false],
      ['parseFloat/parseInt', /\b(?:Number\.)?parse(?:Float|Int)\(/g, false],
    ],
  },
  {
    tema: 'texto',
    marcadores: [
      ['padStart/padEnd', /\.pad(?:Start|End)\(/g, true],
      ['normalize(NFD)', /\.normalize\(\s*["']NF[DC]["']/g, true],
      ['localeCompare', /\.localeCompare\(/g, true],
    ],
  },
  {
    tema: 'browser',
    marcadores: [
      ['window.history', /\bwindow\.history\.\w+/g, true],
      ['navigator', /\bnavigator\.\w+/g, true],
      ['storage local', /\b(?:localStorage|sessionStorage)\b/g, true],
      ['Blob/FileReader/ObjectURL', /\bnew Blob\(|\bFileReader\b|\bcreateObjectURL\(/g, true],
      ['requestAnimationFrame', /\brequestAnimationFrame\(/g, true],
      ['new URL(', /\bnew URL\(/g, false],
      ['URLSearchParams', /\bURLSearchParams\b/g, false],
    ],
  },
  {
    tema: 'log e erro',
    marcadores: [['console.*', /\bconsole\.(?:error|warn|log|info)\(/g, true]],
  },
  {
    tema: 'serialização e identidade',
    marcadores: [
      ['structuredClone', /\bstructuredClone\(/g, true],
      ['Buffer.from', /\bBuffer\.from\(/g, true],
      ['base64 (btoa/atob)', /\b(?:btoa|atob)\(/g, true],
      [
        'crypto',
        /\bcrypto\.(?:randomUUID|getRandomValues|randomBytes|subtle|createHash|createHmac)\b/g,
        true,
      ],
      ['JSON.parse', /\bJSON\.parse\(/g, false],
    ],
  },
];

const PASTAS_COMPARTILHADAS = {
  server: ['src/lib/', 'src/config/', 'src/infrastructure/'],
  client: ['src/lib/'],
  // O game-core inteiro é a lib do domínio: função genérica lá dentro está em casa.
  'game-core': ['src/'],
  contracts: [],
  pacote: ['src/lib/'],
};

const DESTINO_DO_GENERICO = {
  server: 'src/lib/ (genérico) ou packages/game-core (regra de jogo)',
  client: 'src/lib/ (genérico) ou packages/game-core (regra de jogo)',
  'game-core': 'src/lib/ do game-core',
  contracts: 'o game-core (DTO não carrega lógica)',
  pacote: 'src/lib/ do pacote',
};

export function analisarUtilitarios(contexto) {
  const tipo = contexto.app.tipo;
  const ehCompartilhada = criarFiltroDeCompartilhadas(contexto);
  const inventario = inventariarCompartilhadas(contexto, ehCompartilhada);
  const alvo = contexto
    .fichasDoAlvo()
    .filter((f) => !f.gerado && !f.ehTeste && !ehCompartilhada(f));
  const ocorrencias = alvo.map((ficha) => ({ ficha, marcadores: marcadoresDe(ficha) }));
  const destino = DESTINO_DO_GENERICO[tipo] ?? DESTINO_DO_GENERICO.pacote;
  return [
    ...utilitariosExistentesIgnorados(ocorrencias, inventario),
    ...logicaGenericaRepetida(ocorrencias, inventario, destino),
    ...funcoesGenericasForaDaLib(contexto, ocorrencias, inventario, destino),
    ...logicaGenericaEmComponente(ocorrencias, inventario),
  ];
}

// Compartilhado = pasta central do próprio workspace, ou qualquer fonte de um
// pacote de que ele depende (game-core e contracts inteiros são "a lib").
function criarFiltroDeCompartilhadas(contexto) {
  const pastas = PASTAS_COMPARTILHADAS[contexto.app.tipo] ?? PASTAS_COMPARTILHADAS.pacote;
  const pacotes = new Set(dependenciasDoWorkspace(contexto.ambiente, contexto.app));
  return (ficha) => {
    if (ficha.workspace === contexto.app)
      return pastas.some((pasta) => ficha.relativo.startsWith(pasta));
    return pacotes.has(ficha.workspace) && ficha.relativo.startsWith('src/');
  };
}

function marcadoresDe(ficha) {
  const encontrados = [];
  for (const { tema, marcadores } of TEMAS) {
    for (const [rotulo, regex, especializado] of marcadores) {
      for (const ocorrencia of ficha.textoSemComentarios.matchAll(regex)) {
        const linha = ficha.textoSemComentarios.slice(0, ocorrencia.index).split('\n').length;
        encontrados.push({ tema, rotulo, especializado, linha });
      }
    }
  }
  return encontrados;
}

function inventariarCompartilhadas(contexto, ehCompartilhada) {
  const porRotulo = new Map();
  for (const ficha of contexto.fichas.values()) {
    if (ficha.gerado || ficha.ehTeste || !ehCompartilhada(ficha)) continue;
    const exports = ficha.exports.filter((e) => e.tipo === 'function').map((e) => e.nome);
    const vistos = new Set();
    for (const marcador of marcadoresDe(ficha)) {
      if (vistos.has(marcador.rotulo)) continue;
      vistos.add(marcador.rotulo);
      if (!porRotulo.has(marcador.rotulo)) porRotulo.set(marcador.rotulo, []);
      porRotulo.get(marcador.rotulo).push({ ficha, exports });
    }
  }
  return { porRotulo };
}

// Só quem usa o mesmo marcador entra na sugestão: "mesmo tema" apontava
// arquivo sem relação nenhuma para quem só arredondava um número.
function descreverExistentes(inventario, rotulo) {
  const comMarcador = (inventario.porRotulo.get(rotulo) ?? []).slice(0, 3);
  return comMarcador
    .map(
      (item) =>
        `${item.ficha.relativoAoRepo}${item.exports.length ? ` (${item.exports.slice(0, 3).join(', ')})` : ''}`,
    )
    .join(', ');
}

function utilitariosExistentesIgnorados(ocorrencias, inventario) {
  const achados = [];
  for (const { ficha, marcadores } of ocorrencias) {
    const vistos = new Set();
    for (const marcador of marcadores) {
      if (!marcador.especializado || vistos.has(marcador.rotulo)) continue;
      const existentes = (inventario.porRotulo.get(marcador.rotulo) ?? []).filter(
        (e) => e.ficha !== ficha,
      );
      if (existentes.length === 0) continue;
      vistos.add(marcador.rotulo);
      const importaAlgum = existentes.some((e) =>
        ficha.imports.some((i) => i.resolvido === e.ficha.caminho),
      );
      const complemento = importaAlgum
        ? ' (já importa esse utilitário e mesmo assim repete a lógica)'
        : '';
      achados.push(
        achado(
          CATEGORIA,
          'utilitario-existente-ignorado',
          'aviso',
          ficha,
          marcador.linha,
          `usa \`${marcador.rotulo}\` direto; ${descreverExistentes(inventario, marcador.rotulo)} já encapsula isso${complemento}`,
          'chamar o utilitário existente (pelo nome do pacote, se for de outro workspace) ou estender ele, em vez de repetir',
        ),
      );
    }
  }
  return achados;
}

function logicaGenericaRepetida(ocorrencias, inventario, destino) {
  const porRotulo = new Map();
  for (const { ficha, marcadores } of ocorrencias) {
    for (const marcador of marcadores) {
      if (!marcador.especializado) continue;
      if (!porRotulo.has(marcador.rotulo))
        porRotulo.set(marcador.rotulo, { tema: marcador.tema, lugares: new Map() });
      const { lugares } = porRotulo.get(marcador.rotulo);
      if (!lugares.has(ficha)) lugares.set(ficha, marcador.linha);
    }
  }
  const achados = [];
  for (const [rotulo, { tema, lugares }] of porRotulo) {
    if (lugares.size < 2 || (inventario.porRotulo.get(rotulo) ?? []).length > 0) continue;
    const [primeira, ...outras] = [...lugares.entries()];
    const onde = outras.map(([ficha, linha]) => `${ficha.relativoAoRepo}:${linha}`).join(', ');
    achados.push(
      achado(
        CATEGORIA,
        'logica-generica-repetida',
        'aviso',
        primeira[0],
        primeira[1],
        `\`${rotulo}\` (${tema}) aparece em ${lugares.size} arquivos do alvo: aqui e em ${onde}`,
        `centralizar em ${destino}`,
      ),
    );
  }
  return achados;
}

function identificadoresDoNo(ts, no) {
  const nomes = new Set();
  const visita = (filho) => {
    if (ts.isIdentifier(filho)) nomes.add(filho.text);
    ts.forEachChild(filho, visita);
  };
  visita(no);
  return nomes;
}

function funcoesGenericasForaDaLib(contexto, ocorrencias, inventario, destino) {
  const achados = [];
  for (const { ficha, marcadores } of ocorrencias) {
    const importadosDoProjeto = new Set(
      ficha.imports.filter((i) => i.resolvido).flatMap((i) => i.nomes.map((n) => n.local)),
    );
    for (const funcao of ficha.funcoes) {
      if (!funcao.nome || funcao.ehComponente || funcao.ehMetodo || funcao.contemJsx) continue;
      if (funcao.linhaFim - funcao.linha + 1 > TETO_DE_LINHAS_DA_CANDIDATA) continue;
      const dentro = marcadores.filter(
        (m) => m.especializado && m.linha >= funcao.linha && m.linha <= funcao.linhaFim,
      );
      if (dentro.length === 0) continue;
      const usados = identificadoresDoNo(contexto.ts, funcao.no);
      const acoplamento = [...importadosDoProjeto].filter((nome) => usados.has(nome));
      if (acoplamento.length > 0) continue;
      const rotulos = [...new Set(dentro.map((m) => m.rotulo))].join(', ');
      const existentes = descreverExistentes(inventario, dentro[0].rotulo);
      achados.push(
        achado(
          CATEGORIA,
          'funcao-generica-fora-da-lib',
          'info',
          ficha,
          funcao.linha,
          `\`${funcao.nome}\` faz ${dentro[0].tema} (${rotulos}) sem depender de nada do domínio`,
          `mover para ${destino} com teste próprio${existentes ? `; existentes: ${existentes}` : ''}`,
        ),
      );
    }
  }
  return achados;
}

function logicaGenericaEmComponente(ocorrencias, inventario) {
  const achados = [];
  for (const { ficha, marcadores } of ocorrencias) {
    if (ficha.extensao !== '.tsx') continue;
    const componentes = ficha.funcoes.filter((f) => f.ehComponente);
    const vistos = new Set();
    for (const marcador of marcadores) {
      if (!marcador.especializado || vistos.has(marcador.rotulo)) continue;
      const dono = componentes.find(
        (c) => marcador.linha >= c.linha && marcador.linha <= c.linhaFim,
      );
      if (!dono || vistos.size >= TETO_POR_ARQUIVO_EM_COMPONENTE) continue;
      vistos.add(marcador.rotulo);
      const existentes = descreverExistentes(inventario, marcador.rotulo);
      achados.push(
        achado(
          CATEGORIA,
          'logica-generica-em-componente',
          'info',
          ficha,
          marcador.linha,
          `componente \`${dono.nome}\` faz ${marcador.tema} na mão (\`${marcador.rotulo}\`)`,
          `extrair para src/lib/ ou para o game-core e testar sem DOM${existentes ? `; existentes: ${existentes}` : ''}`,
        ),
      );
    }
  }
  return achados;
}
