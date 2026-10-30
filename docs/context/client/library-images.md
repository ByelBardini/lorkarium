# Client — imagens da biblioteca

Complementa [`library.md`](library.md). O contrato e a autorização ficam em [`../library/images.md`](../library/images.md).

## Cadastro e painel

- “Nova imagem” no cabeçalho ou no menu da raiz/pasta abre `LibraryImageForm`. Nome aparado (1–60), arquivo obrigatório, destino herdado da ação e visibilidade são validados pelo DTO compartilhado. A imagem nasce privada.
- `ImagePicker` usa `purpose=library_image` e o fluxo existente de arquivo/link, com `onBusyChange` para impedir cadastro durante o envio. Campos e envio ficam bloqueados sem conexão. O upload e o cadastro têm estados próprios; falha no cadastro conserva nome, pasta, visibilidade e asset para repetir sem reenviar o arquivo.
- O cadastro recebe o DTO confirmado; fecha o formulário, seleciona `image:<id>` e revalida a biblioteca. Erros da API permanecem visíveis, sem sucesso antecipado.
- `ImageDetails` mostra prévia, nome e visibilidade. Mestre pode editar, mover, excluir e “Mostrar para todos”; jogador/espectador só abre prévia. O painel não tem seletor de pasta, ativação, duplicação ou metadados de tokens.
- Apresentar faz um único POST explícito pela `ImagePresentationApi`, aplica sua resposta à store e preserva a visibilidade. Em erro/timeout, mostra a recusa e aguarda `sync()` antes de liberar outro clique; não repete POST automaticamente.
- Excluir pede confirmação; se a imagem é a apresentação atual, explica que fechará para todos. Mudanças `updateImage`/`removeImage` seguem os intents da rota e suas recusas.
- A prévia local é desmontada quando a imagem sai do agregado autorizado (exclusão ou passagem para privado), sem manter conteúdo fora da autorização atual.

## Árvore mista

- `library-entries.ts` adapta grids e imagens ao algoritmo estrutural de `folder-tree.ts`, sem reimplementar ancestrais. IDs têm espaços distintos: `scene:<id>` e `image:<id>`.
- Filtros Todos/Grids/Imagens combinam com busca sem acento/caixa e visibilidade. `LibraryFilter.active` poda pastas vazias mesmo com apenas o filtro de tipo. Criar item limpa todos os filtros.
- “Itens e pastas” mantém teclado, seleção, abertura de ancestrais e contagem total. Descrições acessíveis começam por “Grid” ou “Imagem”; os ícones também diferem.
- Arraste de imagem envia `updateImage`, mantém posição otimista e restaura o agregado confirmado em recusa. Renomear e excluir no menu usam o tipo correto; a organização posterior usa arraste na árvore.

## Apresentação da sala

- Cada `OpenTable` tem uma `imagePresentation` com versão independente da cena/presença. `TableVisit` valida o evento e o escopo da campanha; após cada join confirmado a store relê o snapshot.
- Uma versão menor/igual não substitui a atual. Eventos e HTTP convergem na mesma função `apply`, evitando que um GET lento apague um evento novo.
- Fechar guarda a apresentação dispensada no `sessionStorage`, por conta e campanha. Reconexão/F5 na mesma aba preserva o fechamento; ID novo da mesma imagem abre somente para quem está na sala. Storage indisponível conserva o fechamento em memória.
- `RoomImagePresentation` fica em `PlayRoomPage`, fora do modal da biblioteca e das abas de grid. Só a campanha atualmente montada apresenta. Fechar biblioteca ou trocar de grid não interfere; saída/logout desmonta a janela e limpa o estado pelo ciclo de vida da mesa.
- `ImageViewer` é compartilhado pela prévia e apresentação: imagem inteira com `object-contain`, aviso de carregamento e erro com nova tentativa. Modal tem título, descrição, foco contido, Escape e “Fechar imagem”; teclado não chega ao tabuleiro. Uma nova apresentação substitui a anterior sem empilhar.
- Falha ao recuperar a apresentação mostra aviso com “Tentar apresentação de novo”; o rejoin também tenta recuperar automaticamente.

## Janela desktop e fallback

- Só tenta abrir automaticamente quando é casca desktop e `__LORKARIUM_IMAGE_WINDOW_SUPPORTED__ === true`. Casca antiga ou navegador usa modal; falha de abertura/documento também cai no modal.
- `useImagePresentationWindow` reutiliza o host de Chat/Dados com `panel=image`, nome próprio por campanha e tamanho 960×720. O conteúdo continua no mesmo React/store/socket via `ChatWindowPortal`.
- `DetachedWindowFrame hideOptions` preserva barra e controles nativos, omitindo opções de chat. P2 reutiliza a janela existente; X dispensa apenas a apresentação local. Recusa do fechamento conserva o conteúdo e mostra erro recuperável.
- A marca exige nova release da casca. Não altera allowlist de URL, IPC ou ambiente WebView2. A abertura sem gesto local e o fechamento durante recarga exigem conferência no WebView2 real; Chromium não prova o comportamento do host.

## Testes

- `library-entries.spec.ts`: identidade separada e filtro de tipo.
- `library-mixed.spec.tsx`: contagem e ações, busca/tipo/visibilidade com ancestrais e rollback do arraste.
- `library-image-form.spec.tsx`: cadastro privado, upload pendente, importação bloqueada e reaproveitamento após falha.
- `image-details.spec.tsx`: apresentação sem publicar, erro com recuperação, prévia de jogador e bloqueios sem conexão.
- `image-viewer.spec.tsx` e `room-image-presentation.spec.tsx`: carregar/falhar/repetir, Escape, modal automático, dispensa, substituição e isolamento.
- Driver `/testar`: avisos de espelho em componentes auxiliares antigos são cobertos pelos specs transversais `library-page`, `library-actions`, `library-tree-menu`, `library-drag` e `library-mixed`. O aviso de callback do Escape é falso positivo: o teste prova zero chamadas antes de Escape e uma depois.

## Armadilhas

- Filtrar apenas o array de entradas por tipo, com busca/visibilidade neutras, não faz `filteredTreeOf` podar pastas: propagar `active` é necessário para ocultar ancestrais sem correspondência.
- A lista autorizada e a apresentação são independentes: uma imagem privada apresentada não deve entrar no agregado nem revelar a pasta; a store da apresentação é a fonte do visualizador da sala.

O dropdown de criação do cabeçalho sempre usa a raiz. No menu contextual, o destino é a pasta de origem da ação. O cadastro de imagem recebe esse destino e não oferece seletor de pasta.

A apresentação automática exige presença na sala visível. `RoomImagePresentation` chama `setViewing(true/false)` ao montar/desmontar. O primeiro snapshot da visita apenas sincroniza o estado e dispensa a apresentação anterior; eventos recebidos fora da sala também ficam dispensados. Entrar depois ou voltar de outra tela não abre imagens passadas. Rejoin na sala ainda recupera uma apresentação nova perdida durante desconexão.

## Imagens em documentos

DocumentImagePicker reaproveita ImagePicker por adaptador para endpoints do documento, além de seleção dos itens autorizados da biblioteca. A seleção associa o asset antes de inserir no editor. A autorização dos bytes passa pela referência no documento, independente da existência posterior do item da biblioteca. Ver [documents.md](documents.md).
