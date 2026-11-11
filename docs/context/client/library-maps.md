# Client — mapas da biblioteca

Hub: [`../client.md`](../client.md). Contrato: [`../contracts/mapas.md`](../contracts/mapas.md). Uma aba de mapa por mesa, que navega; imagem HTML com SVG por cima, sem um segundo renderer PixiJS.

## Serviço (`src/services/library-maps-api.ts`)

`LibraryMapsApi` / `HttpLibraryMapsApi`, em `AppDependencies.libraryMapsApi`. Falha como valor (`LibraryMapsResult<T>`), resposta validada pelo DTO, nenhum comando repetido sozinho.

| Método                                      | Rota (sob `/campaigns/:c`)              | Devolve                         |
| ------------------------------------------- | --------------------------------------- | ------------------------------- |
| `detail(c, mapId)`                          | `GET /library-maps/:id`                 | `LibraryMapDetailDto`           |
| `main(c)`                                   | `GET /library-maps/main`                | resumo, ou `null` sem Principal |
| `create(c, input)`                          | `POST /library-maps`                    | `LibraryMapSummaryDto`          |
| `update(c, mapId, changes)`                 | `PATCH /library-maps/:id`               | `LibraryMapSummaryDto`          |
| `remove(c, mapId)`                          | `DELETE /library-maps/:id`              | `null`                          |
| `setMain` / `unsetMain(c, mapId)`           | `PUT` / `DELETE /library-maps/:id/main` | `null` (o resumo é validado)    |
| `createRegion(c, mapId, input)`             | `POST …/:id/regions`                    | `MapRegionDto`                  |
| `updateRegion(c, mapId, regionId, changes)` | `PATCH …/regions/:regionId`             | `MapRegionDto`                  |
| `removeRegion(c, mapId, regionId)`          | `DELETE …/regions/:regionId`            | `null`                          |
| `showRegion(c, mapId, regionId)`            | `POST …/regions/:regionId/shows`        | `null`                          |
| `appearances(c, documentId)`                | `GET /documents/:id/map-appearances`    | lista de `MapAppearanceDto`     |

Falhas: `map_is_main`, `regions_full`, `link_self`, `link_target_not_found`, `region_not_showable` (pelo código), `not_found` (404, inclusive `LIBRARY_MAP_NOT_FOUND`), `forbidden`, `invalid`, `unauthenticated`, `offline`, `unexpected`. Um `link` `locked` com qualquer campo a mais não passa no DTO e vira `unexpected`.

Fake: `LibraryMapsApiFake` (`test/support/library-maps-api-fake.ts`): `detail` lê `maps` (404 se ausente), `heldDetails` segura cada leitura, `heldRegionUpdates` cada `updateRegion`, `detailFailure` responde falha, `answer(método, resultado)` nos demais, `calls` registra. Fixtures em `library-map-fixtures.ts` (`libraryMapDetail`, `mapRegion`, `forestRegion`, `pinRegion`, `mapChanged`).

## Viewport (`src/lib/map-viewport.ts`)

Funções puras sobre o `renderer/camera.ts`, que não importa PixiJS. O mundo do mapa é a imagem em pixels (`asset.width × asset.height`, do DTO: o tamanho é conhecido antes do arquivo baixar). Zoom de 0,05 a 8 (`MAP_ZOOM_LIMITS`), para 8192 px caberem numa janela pequena. `mapPointToScreen` e `screenToMapPoint` vão entre o normalizado e a tela (fora da imagem, abaixo de 0 ou acima de 1); `fitMap`, `panMap` e `zoomMapAt` limitam a câmera com `clampToScene`; `mapPolygonPoints` escreve o atributo `points`. `focusMapOn` põe um ponto no meio da janela e, com o mapa visto inteiro, aproxima até 2,5× o enquadramento (senão centralizar não moveria nada).

## Estado (`src/stores/map-view-store.ts`)

`createMapViewStore({ api, campaignId, mapId })`, uma por aba de mapa: `{ mapId, status, map, camera, trail, selectedRegionId, focusRegionId }`, `status` = `loading` | `ready` | `failed` | `not_found`.

- `load()` relê o mapa mostrado. Só a última leitura pedida pousa. Falha sobre um mapa já na tela o mantém; 404 limpa o mapa.
- Versão menor nunca substitui. Versão **igual** substitui só se o corpo difere, porque o que o leitor pode ver muda sem escrita no mapa (link destravado, papel do leitor); corpo idêntico mantém o objeto e não redesenha.
- `show(mapId)` **recomeça**: limpa a trilha e troca de mapa na mesma aba (zera mapa, câmera e seleção); o mesmo mapa só relê. É o que `openMap` do workspace chama, logo abrir pela biblioteca ou pelo nome da mesa recomeça a trilha sem nada a mais.
- A câmera mora aqui e não no canvas: o painel remonta quando a sala troca de aba, e voltar não pode perder o enquadramento.
- **Trilha** (`trail`: os mapas deixados para trás, sem o atual; cada passo guarda nome e câmera). `enter(mapId)` segue um link, `goBack()` e `returnTo(índice)` voltam; devolvem `MapTravelOutcome` (`arrived`, `not_found`, `failed`, `dropped`).
  - O mapa da tela fica até o próximo ser lido: alvo revogado custa só o aviso. Diferente do `load`, o 404 de uma viagem não fecha a aba; relê o mapa atual (o link pode ter virado `locked`). Voltar a um mapa perdido tira só aquele passo.
  - `enter` num mapa que já está na trilha volta àquele passo: a trilha nunca repete mapa, e um ciclo A → B → A não cresce sem fim.
  - Durante a viagem, `load` não lê: uma releitura do mapa que está saindo (`library:changed`) cancelaria o clique.
- **Seleção e foco:** `selectRegion(id | null, âncora?)` é a região do cartão, e `selectedAnchor` o ponto do mapa clicado (`null` sem clique). `focusRegion(id)` seleciona, zera a âncora e pede centralização; o canvas responde com `landFocus(câmera | null)` assim que tem câmera e tamanho (`null`: a região não existe mais). Pode ser pedido antes de o mapa chegar. Trocar de mapa solta os dois.

## Canvas (`src/features/maps/`)

- `map-canvas.tsx` (`MapCanvas`): moldura com `<img>` (transform CSS) e `<svg>` por cima. O SVG não é escalado; o transform vai num `<g>` dentro dele, porque `non-scaling-stroke` ignora transform de ancestral HTML. Regiões em `regionsPaintOrder`. Enquadra sozinho ao chegar (`useLayoutEffect`, antes de pintar) e por "Enquadrar mapa". Imagem que falha: alerta e "Tentar de novo" (`?retry=n`).
- `map-region-shape.tsx` (`MapRegionShape`): `<g data-region-id>` na cor da região, polígono ou pino; região oculta (só o mestre recebe) mais fraca e tracejada. O pino (`mapPinMarker`) é um disco de 30 px na tela em qualquer zoom, na cor da região, com anel branco para não sumir sobre a imagem, o ícone (`map-pin-icons.ts`) na tinta legível (`legibleInkOn`) e uma área de clique de 44 px, transparente.
- `use-map-gestures.ts`: arrastar move (botão principal, a partir dos 4 px do `moveRightDrag`), roda igual ao tabuleiro (`wheelIntent`: rola move, Ctrl ou pinça dá zoom no cursor), em listener nativo não passivo. O ponteiro só é capturado depois do limiar, porque capturado o clique não chegaria à região; `wasDragged` impede o clique e o duplo clique que encerram um arraste, mas não as teclas: ele fala do último aperto, e tecla não é aperto. Clique no mapa vazio fecha o cartão (o que encerra arraste não).
- **Acessibilidade:** o `<svg>` é `role="group"` "Regiões do mapa"; cada região é `<g role="button" tabIndex=0 aria-label>` (a oculta diz "(oculta)"). Enter abre o que a região liga; sem link aberto, mostra o cartão, porque é o único jeito de o teclado saber o que há ali. Espaço mostra o cartão. Selecionada, `data-selected` e traço mais grosso. Esc fecha o cartão e devolve o foco à região.

## Explorar (`map-explorer.tsx`)

- `MapExplorer` compõe `MapCanvas`, `MapTrail`, `MapPlacesList` e `MapRegionCard`; entra no lugar do canvas em `WorkspaceMap` assim que há mapa.
- **Cartão** (`map-region-card.tsx`): nome, descrição e o estado do link: `open` "Documento: Diário" (com aba, "Documento: Diário › Capítulo", pelo `mapLinkStatusLabel`) e o botão "Abrir", `locked` "O mestre ainda não revelou isto", sem nome e sem botão, `removed` "Link removido" (só o mestre recebe), `null` nada. Abre **ao lado** do ponto clicado (`useMapCardPlacement` + `mapCardPosition`), à direita ou à esquerda quando só lá cabe, nunca sobre o ponto, que precisa ficar livre para o segundo clique do duplo clique. Acompanha o mapa no arraste e no zoom e não sai da moldura; sem clique (lista, teclado, "Mostrar a todos"), abre ao lado do centro da região. É um elemento comum, não um `popover`, cujo "clique fora" comeria esse segundo clique. A medida é refeita quando a região muda, não a cada quadro do arraste, para não forçar layout. A prop `actions` põe botões ao lado de "Abrir".
- **Abrir** (`use-map-region-open.ts`, igual para duplo clique, "Abrir" e Enter): só link `open`. O alvo é conferido de novo em `libraryApi.list`, no que o leitor pode ver agora, porque o link foi lido antes e pode ter sido revogado. Documento: `workspace.open`, com o resumo da lista e o `tabId` do link (grava em `activeTabByDocument` antes de o documento carregar; aba que sumiu cai na primeira). Grid: `tabs.open` + `activate(campanha, null)`, aba pessoal, sem mexer no grupo (`scene:activate` nunca sai daqui). Imagem: `ImageViewerModal`, sem passar pela apresentação. Mapa: `enter`, sem consultar a lista.
- **Alvo revogado:** alerta "Não dá mais para abrir o que está em Capital.", que cita a região e nunca o item, e relê o mapa. Lista inacessível: "Não deu para abrir agora. Tente de novo.".
- **Trilha** (`map-trail.tsx`): "Voltar" e "Mundo › Reino", cada passo um botão, o atual com `aria-current`. Não aparece em mapa aberto direto.
- **Lugares neste mapa** (`map-places-list.tsx`): fechada ao abrir, para não cobrir o mapa; só existe com região. Em árvore (`src/lib/map-places.ts` sobre `mapRegionParents` do game-core): cada lugar sob a menor região que o contém inteiro, recolhido até expandir, nome em ordem por nível. Lugar dentro de região oculta sobe um nível para o jogador, que nem recebe a oculta. Busca sem acento (`searchText`) mantém o caminho até o achado e abre os níveis. Pino mostra o próprio ícone ao lado do nome. Escolher chama `focusRegion`, que centraliza e abre o cartão; expandir não escolhe.

## Mostrar a todos

- **Botão** (`map-region-show-button.tsx`, no `actions` do cartão, só para o mestre): "Mostrar a todos" chama `showRegion`, desabilitado enquanto a resposta viaja. O client não bloqueia região oculta: quem decide é o server, e a recusa (`region_not_showable`, `not_found`) aparece no cartão por `mapRegionFailureMessage`.
- **Evento:** `library:mapRegionShown` vira `{ kind: 'mapRegionShown' }` na `table-visit` e `regionShown` na `scene-tabs-store`, um objeto novo por evento. Não diz o nome do mapa nem do lugar.
- **Quem é levado** (`room-map-focus.tsx`): quem está na sala. `RoomMapFocus` monta ao lado da `PlayRoomPage`, na rota da mesa, e não no `RoomHeader`, que o modo foco tira da tela. Página que cobre a sala (configurações, condições) ou fora da rota da mesa: o evento se perde, e não volta depois, porque só um `subscribe` o lê no momento em que chega.
- `openMapAtRegion` (`open-map-at-region.ts`) é `openMap` + `focusRegion`: o mesmo do "Aparece em" dos documentos. Funciona antes de o mapa chegar, e região que sumiu deixa só o mapa (`landFocus(null)`). A apresentação seguinte substitui a anterior. Sem o nome no evento, a aba diz "Mapa" até a leitura trazer o nome certo.

## Editor (`use-map-editor.tsx`, `use-map-drawing.ts`, `map-editor*.tsx`, `src/stores/map-drawing-flow.ts`)

- **Entrada:** "Editar mapa" no canvas e "Editar lugar" no cartão, só para quem é mestre agora (o papel vem da presença, com `campaign.myRole` de reserva: mestre rebaixado perde o editor na hora). Sem `live`, as duas desabilitam; com o editor aberto, ferramentas, formulário, alças e cliques no mapa param e o rascunho fica. Aberto em um mapa: seguir para outro o fecha.
- No editor, clicar num lugar abre o `MapRegionForm` no lugar do cartão, e o duplo clique não abre o link. "Concluir" joga fora o rascunho.
- **Desenho** (`createMapDrawingFlow`, um por mapa; o rascunho é local ao painel, e trocar de aba o descarta): polígono soma vértices com clique; clique sobre um lugar também soma, sem selecioná-lo; arrastar continua movendo o mapa. Clicar no primeiro vértice ou Enter fecha. O 128º vértice fecha sozinho, porque não cabe outro. Pino é um clique.
- `sameMapSpot` (8 px na tela, por isso depende da câmera) decide se o clique caiu no mesmo ponto: o segundo clique de um duplo clique não soma vértice, e o primeiro vértice com menos de 3 não fecha. Fora da imagem o clique é ignorado.
- **Esc** desfaz o último vértice e, vazio, cancela. Enter e Esc ficam em listener de captura no `window` só enquanto há algo na mão: o foco costuma estar na ferramenta, que responderia à mesma tecla. Em campo de texto não contam.
- **Polígono degenerado** não envia: `mapRegionGeometry` do game-core, a mesma regra do server. O rascunho fica, com o aviso `no_area`.
- **Criar:** um `POST` com o nome "Novo lugar" e o ouro da paleta. Confirmado, a região entra no mapa e o formulário abre nela. Recusa (`regions_full` tem texto próprio) mantém o rascunho, para tentar de novo.
- **Alças** (`map-region-handles.tsx`, só a região selecionada): uma por vértice, ou o pino, com tamanho constante na tela. Arrastar segue o ponteiro, preso à borda da imagem; soltar envia um `PATCH { geometry }`. Soltar onde estava não envia; Esc ou `pointercancel` devolvem a forma.
- **Otimismo e rollback:** `moved` é a forma à frente da confirmada, desenhada por `shownMap`, e dura até a resposta. A confirmada entra antes de `moved` sair, para não piscar a antiga. Na recusa, sai `moved`, volta o que o server confirmou e o motivo aparece na barra. Nada novo começa com um envio no caminho (`saving`), o que evita duas respostas fora de ordem da mesma ferramenta.
- **Confirmado → tela:** `applyRegion`/`dropRegion` da `map-view-store` trocam a região no mapa sem mexer na versão, e os dois ignoram resposta de um mapa que já saiu. A versão nova chega pela releitura do `library:mapChanged`, que o próprio autor também recebe.
- O item ligado escolhe na `libraryApi.list`, lida ao abrir o editor e a cada `library:changed`; falha mostra aviso sobre o formulário, sem bloqueá-lo. Esc dentro do formulário fica nele (desfaz o campo ou fecha o diálogo), sem fechar o lugar.

## Aba (`workspace-map.tsx`, `document-workspace-*`)

- `kind: 'map'` no workspace (`document-workspace-map-ops.ts`): lista `maps`, `openMap({ campaign, mapId, mapName, showsMainMap? })`, chave `mapWorkspaceKey(campaignId)` (por mesa, não por mapa). Reabrir com outro mapa reaproveita a aba e a mesma store. Título = nome do mapa, segue o confirmado; na faixa `MapIcon`, descrição "Mapa", X "Fechar mapa Mundo".
- **O Principal não tem aba.** É a casa da mesa, não um item aberto: com `showsMainMap`, a faixa não desenha a aba e o botão ao lado do nome da mesa faz o papel dela; sai-se pelas abas de grid. O campo segue o `isMain` do mapa lido, então seguir um link para outro mapa faz a aba aparecer, e voltar ao Principal a tira. Sem a informação (`showsMainMap` omitido), conta como Principal até a leitura, para uma aba não piscar e sumir.
- Sem janela própria: `openItemWindow` ignora esse `kind`, e por isso o `WorkspaceMap` não usa o `WorkspaceItemSurface` (que aceita `WindowedWorkspaceItem`). Só desenha com `target`; fechar não pergunta nada.
- 404 fecha a aba, limpa a imagem e deixa o `notice` "O mapa X foi fechado: ele foi excluído ou você não pode mais vê-lo.".
- Relê em `library:changed` (`libraryRevision`), `library:mapChanged` (`mapRevision`, novo `{ kind: 'mapChanged' }` da `table-visit`, que só avisa: região oculta nunca passa pelo socket), ao voltar a `live` (o que foi escrito na queda não avisou ninguém) e quando o papel do leitor muda (mestre rebaixado perde as regiões ocultas).

## Dados do lugar (`map-region-form.tsx`, `map-link-picker.tsx`, `map-messages.ts`)

- `MapRegionForm`: nome, descrição, cor, "Oculta para jogadores", item ligado e "Excluir lugar" (confirma; a recusa fica no diálogo). Recebe a região confirmada e devolve a nova por `onRegionChanged`: o campo não muda antes do server responder. Um `key` por região, para rascunho ou recusa de uma não aparecer na outra.
- Nome e descrição gravam ao sair do campo (`useDraftField`, que na recusa volta ao confirmado). Só muda de espaço nas pontas não envia; nome em branco não envia e avisa. Na descrição, Enter é quebra de linha e Esc desfaz. Cor, oculta e link gravam na hora.
- As gravações de um formulário saem em fila: cada `PATCH` devolve a região inteira, sem versão, e uma resposta ultrapassada traria a região velha de volta.
- A cor é sempre hex no DTO. Um hex da paleta de desenho marca a amostra dela; os demais marcam a cor personalizada.
- `MapPinIconField`, só em pino: os ícones de `MAP_PIN_ICONS`, gravados na hora.
- `MapLinkPicker`: busca sem acento nem caixa (`searchText`) sobre documentos, grids, mapas e imagens, em ordem de nome; fora o próprio mapa e as fichas, que dependem de dono e sandbox. Filtros por tipo ("Todos", "Documentos"…; tipo sem item não aparece) somam com a busca. Cada linha traz ícone, nome e, abaixo, tipo e pasta ("Grid · Ato 1 › Catacumbas"), porque nomes repetidos ("Documento sem nome") só se distinguem por onde estão. Devolve `{ kind, id, tabId? }` ou `null`. Com documento ligado, `MapLinkTabField` ("Abrir em", `Select` do design system) lê as abas pelo `documentsApi.detail` e oferece "Documento inteiro" e cada aba; escolher grava na hora.
- Estados do link: `null` "Sem link" e `removed` "Link removido" deixam a lista aberta, porque só resta escolher; `open` (tipo e nome) e `locked` ("Item que você não pode ver", sem nome) a guardam atrás de "Trocar item". "Remover link" aparece em todos menos no `null`, e no `removed` limpa o aviso de vez.
- `mapRegionFailureMessage`: texto próprio para `regions_full`, `link_self`, `link_target_not_found`, `map_is_main`, `region_not_showable` e `not_found` ("Esse lugar…"); o resto cai no `libraryMapFailureMessage`.

## Home da mesa (`use-map-home.ts`, `room-name.tsx`)

- `RoomName`, no `RoomHeader`: com Principal, um botão de ícone (`MapIcon`, "Abrir o mapa principal") antes do `h1`, que segue sendo só o nome da mesa. Com o mapa na tela, o botão acende em dourado e leva `aria-current="page"`. Etiqueta e sublinhado no nome foram testados e não indicavam o clique. Sem Principal, sem resposta ou com a mesa ainda abrindo, é texto. O leitor chega pelo `MainMapReaderContext` (posto na rota da mesa), porque só o título precisa dele e a página da sala já recebe props demais.
- **Ficha principal, a gêmea do mapa.** `useViewerMainSheet(viewerId)` (`features/sheets/`): o personagem do leitor (`characterOfUser` no `characters` da mesa, por `useRoomTable`), as fichas dele (`useTokenSheets`) e a principal (`mainSheetOf`: a única vale sem escolha). O `RoomHeader` passa o resultado ao `RoomName` (ícone `ScrollTextIcon` "Abrir a ficha de Lyra" logo depois do mapa, mesmo `HomeButton`, dourado com ela na tela) e a `key` ao `SceneTabs` (`mainSheetKey`: a ficha principal não tem aba, como o Principal; as outras fichas têm). Mestre e espectador não têm personagem: sem botão.
- **Atalhos:** Shift+M (mapa) e Shift+F (ficha), por `useHomeShortcut` (`features/board/use-home-shortcut.ts`, sobre o `homeShortcutFor` de `src/lib/board-shortcuts.ts`, que tira as duas do `shortcutFor`) na `window`, valendo com documento na tela (os da sala não valem). Dica e `aria-keyshortcuts` nos botões. Não chegam com o foco dentro do iframe da ficha, nem no modo foco (sem o topo montado).
- `useMapHome` lê `main` ao entrar e a cada `library:changed` (é assim que marcar ou desmarcar o Principal chega aqui). O clique e a chegada chamam `openMap` no Principal, que reaproveita a aba do mapa.
- **Abre sozinho ao abrir a mesa.** A primeira resposta decide, mesmo falha: uma resposta posterior vem de uma mudança na biblioteca, e um mapa pulando na tela no meio da sessão seria surpresa. Por isso Principal marcado durante a sessão só transforma o nome em botão, e `GET main` falho não abre nada nem atrapalha a sala.
- Item já ativo na chegada fica na tela. A própria aba do mapa não conta: ela sobrevive a sair da mesa, e a chegada a recomeça no Principal.
- **Lembrança:** `arrivedAtHome` da `scene-tabs-store`, só em memória, de propósito: vive e morre com a mesa aberta. Abrir a mesa e o F5 começam no Principal; voltar a uma mesa ainda aberta (outra mesa, a home do app) mantém o que estava na tela. Num `sessionStorage`, o F5 caía no grid, porque o workspace não sobrevive ao recarregamento e a marca impedia de reabrir.
- `scene:activated` soma `sceneActivations`; com a aba do mapa ativa a sala volta ao grid do grupo (`activate(campaignId, null)`, a aba continua aberta). Documento, ficha e modelo ativos não mudam.

## O item na biblioteca (`src/features/library/`)

- **Árvore:** `MapEntry` (`kind: 'map'`, id `map:<id>`, `src/lib/library-entries.ts`). Descrição "Mapa · Privado · Principal"; o Principal tem estrela, e o privado segue esmaecido e com o selo de olho cortado no ícone mesmo sendo visto por todos. Filtro "Mapas" para mestre e jogador; arrastar manda `updateMap { folderId }`, com o otimista do `withPendingMove`.
- **Criar:** card "Mapa" do "Novo item" (`library-map-form.tsx`): nome, imagem com `purpose=library_map` e quem vê. Vai direto ao `LibraryMapsApi.create`, fora do fetcher, porque a recusa precisa ficar no formulário conservando o nome e a imagem já enviada (`image-item-form.tsx` e `use-image-item-draft.ts`, os mesmos da imagem). O destino é o do "Novo item": raiz pelo cabeçalho, a pasta pelo "Criar novo item" dela.
- **Intents** `updateMap`, `removeMap`, `setMainMap`, `unsetMainMap` (`map-intent.ts`), texto da recusa por `libraryMapFailureMessage`; `MAP_IS_MAIN` vira "Escolha outro mapa principal antes de excluir este." na linha de status. O client não bloqueia excluir o Principal: quem decide é o server.
- **Painel** (`map-details.tsx`, `region` "Mapa escolhido"): imagem, nome, "Quem vê na biblioteca", "Marcar como principal" / "Deixar de ser principal" (desabilitado do envio até a lista voltar, para não mandar duas vezes), "Abrir" e "Excluir mapa". No privado, um `note` avisa que todos passam (ou seguem) a ver, porque o Principal vence a visibilidade. Jogador só tem "Abrir"; reconectando, tudo desabilita menos "Abrir", que é local.
- **Abrir** é o `openMap` do workspace pelo `useLibraryOpener`, e volta à sala. Mapa não abre em janela.
- **Menu** (`library-map-menu.tsx`, mestre): "Abrir", "Renomear" (no lugar, "Nome do mapa"), "Marcar como principal" e "Excluir mapa" (confirmação).

## Testes

`client/test/features/library/library-maps.spec.tsx` (criar, recusa do cadastro, filtro, marca do Principal, arrastar, menu, painel, jogador, reconexão, `MAP_IS_MAIN`), `client/test/lib/library-entries.spec.ts` e `tree-navigation.spec.ts` (chave e ancestrais do mapa), `client/test/services/library-maps-api.spec.ts`, `test/lib/map-viewport.spec.ts`, `test/stores/map-view-store.spec.ts`, `test/features/maps/{map-canvas,workspace-map,map-explorer,map-region-card,map-trail,map-places-list,map-region-form,map-link-picker}.spec.tsx` (o harness da aba em `test/support/map-tab.tsx`), `test/features/maps/map-messages.spec.ts`, "Mostrar a todos" em `test/features/maps/{room-map-focus,map-region-show-button}.spec.tsx`, o editor em `test/stores/map-drawing-flow.spec.ts` e `test/features/maps/{map-editor,map-editor-place}.spec.tsx`, a home em `test/lib/map-home.spec.ts` e `test/features/maps/{use-map-home,room-name}.spec.tsx`, a ficha principal em `test/features/sheets/use-viewer-main-sheet.spec.tsx` e os atalhos em `test/features/board/use-home-shortcut.spec.tsx` e `test/lib/board-shortcuts.spec.ts`; a parte do workspace, da faixa e do evento em `document-workspace-store.spec.ts`, `scene-tabs.spec.tsx`, `scene-tabs-store.spec.ts` e `table-scene-watch.spec.ts`. No jsdom o canvas só enquadra com `clientWidth`/`clientHeight` falsos.
