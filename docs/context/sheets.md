# Fichas personalizadas

O mestre escreve um **modelo** de ficha (HTML, CSS e JS) na biblioteca e cria **fichas** daquele modelo, também itens da biblioteca (nome, pasta). A ficha pode ficar **sem dono** (só mestres a veem), ir a um **jogador** (fica na âncora do personagem dele no elenco, criada na hora se ele ainda não tem token) ou a um **token**; um personagem ou token pode ter várias. A ficha roda num iframe isolado (origem opaca, sem rede) e só fala com a mesa pelo SDK `window.lorkarium`, por um `MessagePort`; o host traduz cada pedido num comando real e o servidor reautoriza tudo. Produto: [`../spec.md`](../spec.md) §3.12.

> **Detalhe em [`sheets/`](sheets/) e nos arquivos do client abaixo — abra só o arquivo da tarefa.**

## Índice

| Arquivo                                                              | O que cobre                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`sheets/sandbox.md`](sheets/sandbox.md)                             | Sandbox do client: flags do iframe, CSP do `srcdoc`, estilo base, `frame-src` do app, bootstrap/SDK, console, porta, 2º `load`  |
| [`sheets/contratos.md`](sheets/contratos.md)                         | DTOs Zod de modelo, ficha (resumo, dono), valores e ponte (`console`, `bar` por nome ou id)                                     |
| [`sheets/server.md`](sheets/server.md)                               | Server: tabelas `0072`–`0074`, modelos, fichas na biblioteca, dono e âncora, acesso, valores, rotas, eventos, `sheet:adjustBar` |
| [`client/sheets.md`](client/sheets.md)                               | Client: APIs, store dos valores, ponte do host, ficha na sala (aba, janela, moldura, selo do console, card e menu do token)     |
| [`client/sheet-template-editor.md`](client/sheet-template-editor.md) | Editor de modelo: CodeMirror, rascunho, aba/janela, divisória, prévia (tela cheia, janela), console, Ctrl+S, referência da API  |
| [`client/sheet-template-file.md`](client/sheet-template-file.md)     | Arquivo `.lksheet`: ler/escrever, porta `FileDownload`, exportar (árvore, editor) e importar com confirmação                    |
| [`client/library.md`](client/library.md) (Fichas)                    | Ficha como item da biblioteca: `sheet:<id>`, filtro, "Nova ficha", menu (dar, tirar, quem vê, excluir), painel                  |
| [`ci/e2e.md`](ci/e2e.md) (Fichas)                                    | Grupo `sheets` do e2e: `sheet-sandbox`, `sheets` e `sheets-library`, helpers de `e2e/test/support/sheets.ts`                    |

## Regras de negócio

- Sem "modo seguro": a medição de processo (laço infinito na ficha × processo do frame no Chrome e na casca) não foi feita; o procedimento está em [`sheets/sandbox.md`](sheets/sandbox.md). Até lá, uma ficha travada só é contida pelo cão de guarda ("A ficha não respondeu").
- Exportar e importar modelo (`.lksheet`) é só do mestre: exporta sempre a versão salva e importa sempre como modelo **novo**, pelo `POST` de sempre; o código importado roda na mesma sandbox, sem exceção.
- O console da ficha na sala é só de quem gerencia (`canManage`, o mestre); o jogador não recebe linha nenhuma.

## Armadilhas

- **Ficha em janela travava no cão de guarda ("A ficha não respondeu"):** o portal desenha o frame na auxiliar, mas o `postMessage` da porta sai do código da janela da sala, então o `event.source` no frame é a sala e não o `parent`. O bootstrap exigia `source === parent`, descartava a porta e o `ready` nunca saía. Agora aceita qualquer janela fora do frame (`sheet-bridge-bootstrap.spec.ts`, "not its parent"); a prévia do editor em janela também passou a funcionar. Spec com fake de janela precisa de `parent` (o `FrameWindowRefFake`, ele mesmo no topo).
- **Vazamento no e2e se conta na rota, não no `page.on('request')`:** o Chromium dispara `request` também para o pedido que o CSP barra (seguido de `requestfailed` com `csp`). Quem prova "nada saiu" é um `context().route` para tudo que não é `localhost`, que só vê o que chegaria à rede.
- **O modelo do e2e nasce do código inicial do client** ("Novo modelo de ficha" → `STARTER_SHEET_SOURCE`: PV, "Força", "−5 PV", "Rolar ataque"); o e2e só digita o nome. Mudar o código inicial (ids `#pv`, rótulos, `1d20+5`, salvar no `change`) quebra o `sheets.spec.ts`. Código que exigiria digitar no CodeMirror vai pela rota `POST …/sheet-templates`. O "−5 PV" acha a barra pelo **nome** (`bars.adjust('PV', …)`): o token do e2e precisa de uma barra "PV" (e só uma).
- **O "Força" do código inicial salva no `change`:** `fill` sozinho não salva; o e2e sai do campo com Tab e confere pela rota `GET …/sheets/:s` antes de recarregar (o `dispose` manda o lote pendente sem esperar resposta).
- **O Caio só abre a ficha pelo card "Na mesa"** ("Abrir ficha de Lyra", com uma ficha; com várias o card dá o menu "Fichas de Lyra"): o menu do token é só de quem controla.
- **Criar a ficha pelo menu abre a aba dela para o mestre e esconde o tabuleiro:** feche a aba ("Fechar Ficha · <nome da ficha>", o nome padrão é "<modelo> · <token>") antes de clicar no tabuleiro de novo.
- **O título da aba é o nome da ficha, não o do token**, e segue o nome salvo: spec que abre uma ficha pelo fake precisa que o `detail` devolva o mesmo nome (`serverSheetIs`), senão a aba muda de nome ao carregar.
- **O card "Na mesa" lista as fichas do personagem (a âncora do elenco), não as do token principal:** com o card sem âncora (`anchorTokenId: null`), uma ficha feita no menu de um token que não está ligado à ficha da mesa não aparece no card de ninguém (decisão provada em `client/test/lib/character-anchor.spec.ts`). O e2e liga a Lyra ao card da Bia (`linkCenterTokenToCard`) antes de criar a ficha; sem isso o Caio nunca acha o "Abrir ficha de Lyra".
- **O nome da ficha é o título de tudo no e2e** (aba, região, `iframe`, aviso de 404, item da árvore): os helpers recebem o nome confirmado pela resposta do `POST …/sheets`, nunca o nome do token.
- **Ctrl+S dentro da prévia não salva:** o frame é outro documento (origem opaca) e o atalho escuta só o documento do editor; o e2e aperta com o foco no código ou no nome.
- **A linha do erro no console é do arquivo JS**, só quando a posição cai no JS do autor (erro num `onclick` do HTML não ganha linha); o e2e que conferir "linha L" precisa do erro no JS.
