# Client — documentos

Hub: [`../client.md`](../client.md). Contratos e autorização: [`../documents.md`](../documents.md).

## Editor rico

- `src/rich-text-editor/` é a única área que importa Tiptap 3 (`react`, `pm`, `core`, `starter-kit`, `extension-text-style`, `extension-text-align`, `extension-image`, `extension-table`). O painel carrega `document-editor.tsx` por `lazy`/`import()`, mantendo o editor fora do chunk inicial.
- `DocumentEditor` recebe o JSON `DocumentContentDto`, `editable`, `onChange`, resolvedor `assetUrl` e callbacks de imagens. Leitor e editor usam as mesmas extensões; o leitor não mostra toolbar nem `textbox` e abre links validados com `noopener,noreferrer`.
- A toolbar em pt-BR oferece fontes locais, 8–72 px, cor, negrito/itálico/sublinhado/tachado, H1–H3, parágrafo, alinhamento, recuo 0–6, entrelinha, listas, citação, separador, link, imagem, tabela, linha/coluna/cabeçalho e histórico. Botões preservam seleção com `preventDefault` no mouse; selects retomam a seleção do editor ao aplicar comandos.
- Fontes: `document-fonts.ts` guarda no JSON o nome do contrato e desenha uma pilha CSS (`documentFontStack`): as empacotadas apontam para a família `… Variable` do fontsource, as do Windows têm reserva para outros sistemas. `documentFontOf` lê o primeiro nome de um `font-family` colado; fonte fora da lista some na colagem. Nenhum `<select>` nativo na toolbar: estilo do parágrafo, fonte, entrelinha e alinhamento usam `ToolbarMenuSelect` (`toolbar-menu-select.tsx`, menu Radix com `menuitemradio`, no tema). O seletor de fonte (`document-font-picker.tsx`) mostra cada nome na própria fonte, menos Symbol/Webdings/Wingdings; “Fonte padrão” tira a fonte (`unsetFontFamily`).
- Tamanho (`document-font-size.tsx`): campo digitável (Enter ou sair aplica, Escape desiste; fora de 8–72 volta ao atual, por `typedFontSize`) e lista com os tamanhos usuais (8–72 em degraus de editor de texto).
- Espaçamento compacto: entrelinha padrão 1,15 (`.document-prose` e `DEFAULT_LINE_HEIGHT` da toolbar andam juntos) e 0,35em entre blocos. A entrelinha por parágrafo/título (1 · 1,15 · 1,5 · 2) é um select sempre visível na toolbar; alinhamento e recuo ficam no popover “Opções de parágrafo”. O texto ocupa a largura do painel, com 24px no topo e 32px nas laterais (16px abaixo de 640px).
- `document-content-adapter.ts` remove atributos de renderização/defaults nulos antes de validar pelo contrato compartilhado. O JSON persistido não inclui `src`, eventos ou atributos HTML arbitrários; imagem armazena somente `assetId` e apresentação permitida. O adaptador resolve a URL autenticada apenas no DOM.
- Imagens HTML coladas são removidas antes do parser; URLs HTTP(S) são importadas por callback. Arquivos colados/soltos usam callback de envio. O texto colado segue o parser do subconjunto habilitado. Falha de imagem conserva texto e mostra aviso. Um bookmark guarda seleção durante o seletor/envio; respostas após desmontagem ou perda de edição não inserem imagem.
- `DocumentEditorMenu` oferece Recortar/Copiar/Colar/Selecionar tudo somente no contenteditable da casca desktop. Usa a seleção do editor e clipboard do projeto, sem ampliar o menu global de input/textarea. A colagem textual pelo menu insere nó de texto, sem interpretar HTML.
- Limites de conteúdo pertencem ao contrato; erro de validação não envia conteúdo inválido e pede desfazer a alteração. Sem colaboração CRDT/OT, hotlink, HTML bruto ou mescla de célula.

## Biblioteca

- `document:<id>` separa documentos de imagens/grids. O filtro Documentos reutiliza árvore estrutural, ancestrais e busca por nome, com contagens mistas.
- Novo documento no cabeçalho nasce na raiz; menu contextual herda a pasta. Criação limpa filtros, seleciona confirmação e foca título. A árvore oferece renomear pelo painel e exclusão confirmada; arraste usa versão esperada e recibo do comando administrativo.
- A seleção na biblioteca mostra somente uma prévia na coluna da direita. “Expandir documento” fecha a biblioteca e ativa a aba do documento na faixa superior da sala, junto de “Grupo”. A árvore permanece disponível ao reabrir a biblioteca.
- `LibraryDialog` guarda Escape/X. `LibraryBrowser` encaminha revisão da biblioteca e presença para revalidar acesso do documento aberto.

## API e rascunho

- `services/documents-api.ts`: `DocumentsApi`/`HttpDocumentsApi`, no `AppDependencies.documentsApi`, valida detalhes e recibos; diferencia conflito, reutilização de comando, acesso, rede e resposta inesperada. Upload/importação/seleção da biblioteca usam os endpoints do documento, nunca a rota genérica de assets.
- `stores/document-editor-store.ts`: uma instância por painel/conta/campanha/documento; não persiste texto no storage. Separa documento confirmado, rascunho e snapshot enviado. Debounce de 1000 ms pelo `InteractionClock`, apenas um envio em voo, `actionId` mantido na tentativa incerta. A resposta de A não limpa B digitado durante o envio.
- Em timeout, relê o documento antes de repetir a tentativa idempotente. Conflito permanece suspenso através de invalidações; “Carregar versão atual” confirma descarte. Perda de edição conserva rascunho copiável e muda a leitura; 404/401 limpa todo o conteúdo. Resposta depois da saída não repõe o estado.
- `features/documents/document-panel.tsx` carrega editor sob demanda, escoa pendências ao fechar/trocar e pede continuar ou descartar quando não consegue salvar. `beforeunload` só enquanto há rascunho. Logout/saída desmonta a instância. Compartilhamento e exclusão passam pelas actions da biblioteca; edição usa fluxo serializado próprio.
- `DocumentImagePicker` reutiliza `ImagePicker` com um adaptador para imagens do documento; o seletor também aceita os itens autorizados da biblioteca. Uma falha mantém o texto e permite corrigir a origem.
- Fakes: `DocumentsApiFake`, `documents-fixtures.ts` e `InteractionClockFake`. Specs de store/API/painel cobrem debounce, digitação durante envio, conflito repetido, timeout, leitura revogada, leitor e fechamento offline.

## Abas e janelas do documento

- `document-workspace-store.ts` conserva uma instância do editor por `campaignId:documentId`, com resumo confirmado, alvo de painel e handle da janela. `open`, `close`, `setTarget` e `openWindow` deixam o rascunho vivo ao navegar entre mesas; o texto permanece apenas na memória. Fechar tenta salvar e consulta a confirmação do painel quando há pendência. Recusa de fechamento nativo mantém documento e janela para tentar novamente.
- `DocumentWorkspaceHost`, montado no shell, move o painel entre o alvo da aba da sala e `ChatWindowPortal`, sem duplicar a store. Sem alvo mantém o editor fora da área visível; foco inicial só é aplicado no painel visível. O host acompanha presença, papel e `libraryRevision` da campanha correspondente. Perder acesso limpa resumo, rascunho e janela; remoção da mesa limpa somente os documentos dela. O ciclo da sessão na raiz limpa tudo no logout ou troca de conta.
- A biblioteca mostra `DocumentPreview`, somente leitura, com “Expandir documento” e “Abrir em outra janela”. Expandir ativa uma aba junto dos grids, na mesma sala; `activeByCampaign` e `activate` controlam qual documento ocupa o painel. As abas abertas usam o título confirmado; fechar a aba ativa volta ao grid após confirmar eventuais pendências. As ações administrativas usam a action `/campaigns/:campaignId/table/library`.
- Faixa de abas (`scene-tabs.tsx`): grids e documentos encolhem juntos até `TAB_MIN_WIDTH` (112px, `min-w-28`); o que não cabe vai para o menu “+N” (`Mais N abas`, `Mais 1 aba`), e escolher uma aba dali a mostra. “Grupo” e a aba mostrada nunca saem da faixa. A conta é pura em `lib/tab-overflow.ts` (`tabsThatFit`, `splitTabsToFit`), a largura vem de `lib/use-element-width.ts`; sem medida (0, jsdom) todas aparecem. A faixa ocupa o espaço livre da barra, mas só a tablist e o “+N” são `no-drag`: o resto continua arrastando a janela do desktop.
- A janela `/chat-window.html?panel=document` usa nome por campanha/documento e 1000×800. Moldura: `DetachedWindowFrame` com `flush` e `actions` (“Voltar para a aba”, ao lado do alfinete “Sempre por cima” que a moldura já põe na barra). O `DocumentPanel` entra `compact`: cabeçalho de uma linha, sem “Mesa / Documento” e sem o X (o X da janela já devolve à aba). `openWindow` chama o host de forma síncrona no gesto do usuário, permitindo abrir direto da prévia; `useChatWindow` adota esse handle sem chamar `open` novamente. Bloqueio mantém o documento na aba com aviso. “Sempre por cima” reaproveita o controle nativo e só fica disponível quando o host o oferece.
- A adoção do handle acontece após o ciclo inicial de efeitos, para o ensaio do StrictMode não fechar a janela que acabou de ser aberta pelo gesto da prévia. O editor e o conteúdo não são persistidos em storage.

## Armadilhas

- Atualizar o confirmado ao detectar conflito não autoriza retomar o autosave numa segunda invalidação com a mesma versão. O estado de conflito permanece até descarte explícito.
- O callback que revalida a biblioteca após salvar precisa ser estável: um callback novo em cada render reaciona o efeito de salvo continuamente.
- O menu pode terminar de fechar após o editor ser destruído por revogação/desmontagem. Conferir `editor.isDestroyed` antes de restaurar foco ou executar comando.
- Uma instância Tiptap pode existir com a view desmontada durante StrictMode/Suspense. Atualizar opções sem acessar `view.dom`; sincronizar conteúdo no `onCreate` e só emitir comandos no efeito depois de `isInitialized`.
- A seleção nativa pode anteceder a seleção ProseMirror por um evento. `captureDocumentSelection` usa a seleção dentro do editor antes de a toolbar tomar foco; a toolbar assina transações separadamente, sem refazer o editor inteiro a cada seleção.

- A lista de um `<select>` nativo sai branca no Chromium, fora do tema escuro (com ou sem `style` nas `<option>`): escolhas da toolbar vão no `ToolbarMenuSelect`, nunca num `<select>`.
- Span colado sem tamanho ou cor chega do Tiptap com `fontSize: ''`/`color: ''`, não `null`: o adaptador descarta `''` e textStyle vazio, senão a colagem falha no contrato e o documento para de salvar.

## Testes do editor

`client/test/rich-text-editor/{document-content-adapter,document-editor,document-extensions}.spec.*`: sanitização, identidade de imagem sem src, leitor, formatação da seleção, alinhamento/recuo/entrelinha, tabela com preservação de texto, desfazer/refazer e HTML externo sem imagem remota.
