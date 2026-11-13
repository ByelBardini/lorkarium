# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, moldura do app em `src/app/shell/`, tabuleiro em `src/renderer/` (PixiJS, sem React; ver [`client/board-renderer.md`](client/board-renderer.md)), dados 3D pelo pacote `@lorkarium/dice-renderer` (o único lugar do `three`, ver [`dice-renderer.md`](dice-renderer.md); o client o carrega por `import()` em `src/features/dice/app-dice-renderer.ts`) som dos dados em `src/dice-audio/` (ver [`client/dice.md`](client/dice.md)) e som do chat em `src/chat-audio/` (ver [`client/chat-som.md`](client/chat-som.md)).

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda o índice; a estrutura transversal está em [`estrutura.md`](client/estrutura.md).

| Assunto                                                                                        | Arquivo                                                         |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Estrutura: `main.tsx`, `AppDependencies`, componentes, `lib/`, serviços e stores transversais  | [`estrutura.md`](client/estrutura.md)                           |
| Tokens de cor, tipografia, forma, componentes base e regras anti-template                      | [`design-system.md`](client/design-system.md)                   |
| Shell (trilho, menu, gaveta), home, diálogos de mesa e detalhe                                 | [`home.md`](client/home.md)                                     |
| Peças da mesa: capa, status, avisos, tags, prévia, `update`/código/excluir, eventos ao vivo    | [`campaign-parts.md`](client/campaign-parts.md)                 |
| Página "Configurações da mesa" na sala: rota, moldura, ação, rascunho, seções, pendência       | [`campaign-settings.md`](client/campaign-settings.md)           |
| Tempo real: transporte Socket.IO, sessão da mesa, mesas abertas da aba, presença e versão      | [`realtime.md`](client/realtime.md)                             |
| Amigos: tela `/friends`, conexão da conta, `FriendsApi`, stores, status e mensagens locais     | [`friends.md`](client/friends.md)                               |
| Sala de jogo: tabuleiro, renderer, câmera, ferramentas, sync e comandos                        | [`board.md`](client/board.md)                                   |
| Renderer PixiJS: câmera, entrada, `BoardView`, hover, faixas, adaptador                        | [`board-renderer.md`](client/board-renderer.md)                 |
| Atalhos da sala e do tabuleiro: F, Esc, ferramentas, câmera, edição                            | [`board-atalhos.md`](client/board-atalhos.md)                   |
| Tokens na sala: arraste, teclado, lista "Na cena", detalhe, diálogo e barras                   | [`tokens.md`](client/tokens.md)                                 |
| Diálogo do token: prévia (lugar da imagem), abas Básico, Barras, Formas, Visão e luz           | [`token-dialog.md`](client/token-dialog.md)                     |
| Formas no mapa: `token:formChanged`, `setTokenForm`, desfazer, "Trocar forma", teclas 1–8      | [`token-forms.md`](client/token-forms.md)                       |
| Chaves de token da mesa: o jogador cria, edita e exclui os seus                                | [`token-rights.md`](client/token-rights.md)                     |
| Patrulha do token: relógio do server, poses por timer, traço, editor, menu "Patrulhando"       | [`token-patrols.md`](client/token-patrols.md)                   |
| Auras dos tokens: estado e eventos, formulário (`AuraEditor`), onde se edita, desenho          | [`auras.md`](client/auras.md)                                   |
| Rodapé do token (`TokenDock`): selecionado, token do meu personagem ou o personagem            | [`token-dock.md`](client/token-dock.md)                         |
| Aba "Na mesa": mestres, card do personagem de cada jogador (barras, CA, fichas), ausência      | [`table-people.md`](client/table-people.md)                     |
| Papéis na mesa: dono, co-mestre, juggernaut, troca de papel e o modo do admin                  | [`table-roles.md`](client/table-roles.md)                       |
| Combate na sala: tracker, iniciativa, turnos, condições e a vez no tabuleiro                   | [`combat.md`](client/combat.md)                                 |
| Condições: etiquetas, descrição, stacks, página "Condições da mesa", ferramenta (C)            | [`conditions.md`](client/conditions.md)                         |
| Desenhos na sala, copiar/colar (Ctrl+C/V) e desfazer/refazer (Ctrl+Z/Y)                        | [`drawings.md`](client/drawings.md)                             |
| Áreas de efeito na sala: estado, ferramenta (M), seleção, alças, copiar                        | [`effect-areas.md`](client/effect-areas.md)                     |
| Paredes e portas na sala: estado, ferramenta (P), linhas, edição, portas                       | [`walls.md`](client/walls.md)                                   |
| Visão: alcance do token, modo da cena, filtro, névoa, rota, prévia do mestre                   | [`vision.md`](client/vision.md)                                 |
| Tokens que bloqueiam a visão: contornos por asset, lista única de paredes de visão             | [`sight-blockers.md`](client/sight-blockers.md)                 |
| Luzes: estado, comandos, luz do token, ferramenta (L), ícones, acender                         | [`lights.md`](client/lights.md)                                 |
| Cone: campo de visão, lanterna, holofote mirado, contorno do mestre                            | [`cones.md`](client/cones.md)                                   |
| Desempenho: orçamento, regras que não podem ser desfeitas, cena de estresse, bench, painel     | [`performance.md`](client/performance.md)                       |
| Desempenho: medições de antes e depois (bench, painel, textura)                                | [`performance-medicoes.md`](client/performance-medicoes.md)     |
| Desempenho: armadilhas (render por quadro, GPU, `addressMode`, texto)                          | [`performance-armadilhas.md`](client/performance-armadilhas.md) |
| Desempenho do React: stores que não notificam à toa, painéis fora do arraste, linhas memo      | [`performance-react.md`](client/performance-react.md)           |
| Zoom: assentamento do gesto, recorte pela faixa, perda de contexto WebGL, medições             | [`zoom.md`](client/zoom.md)                                     |
| Biblioteca: rota, gaveta lateral, árvore de pastas e grids, menu, painel e arrastar            | [`library.md`](client/library.md)                               |
| Documentos: editor rico, rascunhos, salvamento, posse e leitura protegida                      | [`documents.md`](client/documents.md)                           |
| Fichas: `SheetsApi`, store, ponte do host, ficha na sala (aba/janela), editor de modelo        | [`sheets.md`](client/sheets.md)                                 |
| Editor de modelo de ficha: CodeMirror, rascunho, prévia, biblioteca, aba e janela              | [`sheet-template-editor.md`](client/sheet-template-editor.md)   |
| Imagens na biblioteca: cadastro, árvore mista, prévia, apresentação e janela desktop           | [`library-images.md`](client/library-images.md)                 |
| Mapas da biblioteca: `LibraryMapsApi`, viewport, `map-view-store`, canvas SVG, aba do mapa     | [`library-maps.md`](client/library-maps.md)                     |
| Abas de grid na sala: escopo do comando, `watch`, `scene-tabs-store`, `SceneTabs`              | [`grid-tabs.md`](client/grid-tabs.md)                           |
| Personagem: store `character:*`, token ligado composto, ligar a personagem, fichas             | [`characters.md`](client/characters.md)                         |
| Ping no mapa: cor por pessoa, segurar/Alt+clique, pulso do anel, seta na borda                 | [`pings.md`](client/pings.md)                                   |
| Minha conta em abas (`?aba=`): perfil, dados, segurança, 2FA, link do e-mail, Seu plano        | [`account.md`](client/account.md)                               |
| Backoffice: moldura, Usuários, busca/filtros na URL, convidar, menus e diálogos das contas     | [`backoffice.md`](client/backoffice.md)                         |
| Dados: rede, stores, 3D (conta e adaptador), e o índice da aba "Dados"                         | [`dice.md`](client/dice.md)                                     |
| Aba "Dados": bandeja, salvas em etiquetas, histórico em linhas, aviso sobre o tabuleiro        | [`dice-tab.md`](client/dice-tab.md)                             |
| Chat da mesa: rodapé (barra, gaveta, prévia, aviso), store de conversas, campo, feed, destino  | [`chat.md`](client/chat.md)                                     |
| Janelas de Chat, Dados e Imagens: host, portal, controles e portais Radix                      | [`chat-janela.md`](client/chat-janela.md)                       |
| Som do chat: menção e sussurro, asset CC0, intervalo, chave "Som do chat"                      | [`chat-som.md`](client/chat-som.md)                             |
| Brilho do ícone na barra de tarefas (desktop): pendente por mesa, foco, porta Tauri            | [`chat-atencao.md`](client/chat-atencao.md)                     |
| Rotas: tabela, guardas, `restoreOpenTables`, árvore, `next` do login                           | [`rotas.md`](client/rotas.md)                                   |
| Links de conta: `/invite` (escolher @ e senha) e `/reset-password`                             | [`account-links.md`](client/account-links.md)                   |
| Barra de título do app desktop: `WindowTitleBar`, controles, lugar por rota, slot da sala      | [`title-bar.md`](client/title-bar.md)                           |
| Menu dos campos de texto no app desktop: `isDesktopShell`, itens, `FieldEditing`, raiz         | [`text-field-menu.md`](client/text-field-menu.md)               |
| Versão nova depois do deploy: impressão do build, aviso, recarga segura                        | [`app-update.md`](client/app-update.md)                         |
| Cor personalizada: canvas, ladrilho, painel, `PaletteColorField`, cores salvas da conta        | [`color-picker.md`](client/color-picker.md)                     |
| Escolher imagem: `ImagePicker`, arquivo, link, recorte da foto, capa e banner                  | [`image-picker.md`](client/image-picker.md)                     |
| Controles pelo plano: `usePlanLimits`, `countGate`/`featureGate`, botões e recursos desligados | [`plans/client-controles.md`](plans/client-controles.md)        |
| Testes: Vitest em jsdom, setup, `testDependencies()`, fakes do `test/support/`                 | [`testes.md`](client/testes.md)                                 |
| Armadilhas gerais do client (router, Radix, React Compiler, jsdom, Playwright)                 | [`armadilhas.md`](client/armadilhas.md)                         |

## Estrutura

`main.tsx`, `buildRoutes`/`AppDependencies`, `src/components/`, `src/lib/`, os serviços HTTP e os stores comuns: [`client/estrutura.md`](client/estrutura.md).

## Rotas

Tabela de caminhos, guardas (`middleware` + `decideAccess`), `restoreOpenTables`, árvore e o `next` do login: [`client/rotas.md`](client/rotas.md). `/api` e `/assets/` são reservados (ver Regras de arquitetura).

## Regras de arquitetura

shadcn e tokens, pt-BR, rede só por `src/services/`, modo data do React Router, proxy do Vite: [`client/regras-arquitetura.md`](client/regras-arquitetura.md).

## Testes

Vitest em `jsdom`, setup, `testDependencies()` e os fakes de `client/test/support/`: [`client/testes.md`](client/testes.md).

## Armadilhas

Em [`client/armadilhas.md`](client/armadilhas.md) (React Router, Radix/shadcn, React Compiler, jsdom, Playwright).
