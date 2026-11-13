# Client · amigos: API, store, presença, mensagens privadas e tela

A tela de Amigos (`/friends`) e a camada de dados dela. Contrato em [`../contracts/amigos.md`](../contracts/amigos.md); o socket da conta em [`realtime.md`](realtime.md) ("Conexão da conta"). Nada de mensagem é gravado no server: o histórico é do aparelho.

## Fiação

`main.tsx` cria `AccountRealtime`, `HttpFriendsApi`, `createFriendsStore(friendsApi)` e `createDirectMessagesStore({ commands: RealtimeDirectMessageCommands, storage: localStorage, clock: browserWallClock })` e chama `linkAccount` (`src/app/account-link.ts`), que assina `subscribeFriendsEvents` e `subscribeDirectMessageEvents` no socket e segue a sessão. `AppDependencies` leva `accountRealtime`, `friendsApi`, `friends` e `directMessages`; no `testDependencies()`: `FriendsApiFake` (`friendsApi`), `DirectMessageCommandsFake` (`directMessageCommands`), `StorageFake` (`directMessagesStorage`), `RealtimeTransportFake` (`accountTransport`), com o `interactionClock` como relógio do "digitando".

## `FriendsApi` (`src/services/friends-api.ts`)

`HttpFriendsApi(transport)` sobre `callApi`; todo 2xx validado pelo DTO (fora dele: `unexpected`). Métodos → `FriendsResult<T>` (`{ ok, value }` | `{ ok: false, failure }`):

| Método                              | Rota                                    | `value`                    |
| ----------------------------------- | --------------------------------------- | -------------------------- |
| `overview()`                        | `GET /friends`                          | `FriendsOverviewDto`       |
| `sendRequest(@)`                    | `POST /friends/requests` `{ username }` | `'sent'` \| `'accepted'`   |
| `acceptRequest(userId)`             | `POST /friends/requests/:id/accept`     | `FriendDto`                |
| `dropRequest(userId)`               | `DELETE /friends/requests/:id`          | `null` (recusa ou cancela) |
| `removeFriend(userId)`              | `DELETE /friends/:id`                   | `null`                     |
| `block({ userId } \| { username })` | `POST /blocks`                          | `BlockedUserDto`           |
| `unblock(userId)`                   | `DELETE /blocks/:id`                    | `null`                     |

O @ vai como foi digitado (o `typedUsernameDto` do server tira o `@`). `FriendsFailure`: cada `FRIEND_ERROR_CODES` vira um `kind` em snake_case (`user_not_found`, `already_friends`, `request_already_sent`, `request_to_self`, `user_blocked_by_you`, `request_not_found`, `friend_not_found`, `already_blocked`, `block_not_found`); os tetos levam o número para a frase (`friend_limit` 200, `outgoing_request_limit` 50, `block_limit` 200, de `FRIENDS_MAX`/`OUTGOING_REQUESTS_MAX`/`BLOCKS_MAX`); sem código conhecido cai no status (`invalid`, `unauthenticated`, `rate_limited`, `unexpected`) e a rede em `offline`.

## Eventos (`src/services/friends-events.ts`)

`subscribeFriendsEvents(transport, account, listener)` entrega `FriendsEvent`: a cada `connected` da conta, primeiro `friendsChanged` (relê o que mudou com o socket caído) e o `presence:sync` (sem payload, ack em 5 s) → `presenceSynced { friends }`; `presence:friendChanged` válido → `friendChanged { event }`; `friends:changed` válido → `friendsChanged` **e** um novo `presence:sync` (o server não manda `presence:friendChanged` ao nascer uma amizade; sem isso o amigo novo ficaria offline até a próxima conexão — o `friends.spec.ts` do e2e quebra nessa linha). Fora do DTO, sync recusado ou sem ack: cai calado (a próxima conexão pede de novo).

## Store de amigos (`src/stores/friends-store.ts`)

`createFriendsStore(api)`; estado `{ overview: FriendsOverviewDto | null, loading, failure, presence: Record<userId, { status, table }> }`.

- `load()` — uma leitura em voo por vez: chamadas durante ela marcam **uma** releitura depois. Falha mantém o último `overview` com `failure`; leitura boa zera `failure`.
- `apply(evento)` — `friendsChanged` → `load()`; `presenceSynced` substitui toda a presença; `friendChanged` troca só a daquele amigo, e é ignorado se não for amigo (ou antes da primeira leitura).
- Comandos `sendRequest(@)` (devolve o `outcome`), `acceptRequest`, `dropRequest`, `removeFriend`, `block(alvo)`, `unblock` → `FriendsResult` (`value: null` nos que não são o pedido); sucesso relê a lista (o server é a autoridade), recusa não lê nada.
- `reset()` (logout) — volta ao vazio; leitura em voo que responder depois é descartada.
- Seletores: `presenceOf(estado, userId)` (`offline` sem notícia), `selectIncomingCount(estado)` (metade do badge do trilho), hook `useFriends(store, seletor)`.

## Mensagens privadas

- `src/services/direct-message-commands.ts` — `RealtimeDirectMessageCommands(transport, newActionId)`: `send(toUserId, texto)` → `{ ok, messageId }` | `{ ok: false, failure }` (`not_friends`, `recipient_offline`, `sender_invisible`, `rate_limited { retryAfterSeconds }` — 1 s se o server não disser —, `invalid`, `unauthenticated`, `unexpected` fora do DTO, `offline` sem ack em 5 s); `typing(toUserId)` emite `dm:typing` só com o socket de pé.
- `src/services/direct-message-events.ts` — `subscribeDirectMessageEvents(transport, listener)`: `dm:sent` → `{ kind: 'sent' }`, `dm:typingFrom` → `{ kind: 'typingFrom' }`; fora do DTO cai calado (nada é gravado, não há o que sincronizar).
- `src/lib/direct-conversations.ts` — `DIRECT_HISTORY_LIMIT` (200), `TYPING_SHOWN_MS` (4000), chaves `lorkarium.dm.<conta>.<amigo>` (`directConversationStorageKey`) e o índice `lorkarium.dm.<conta>` (`directIndexStorageKey`: a lista dos amigos com conversa, pois o storage não lista chaves), `friendIdOf(evento, conta)`, `withDirectMessage(conversa, evento, { open })` (uma vez por `messageId`, teto descartando a mais antiga, não lida só a do amigo com a conversa fechada).
- `src/lib/direct-message-failure-text.ts` — `directMessageFailureText(failure, nomeDoAmigo)`: a frase pt-BR sob o campo ("Bia está offline. Mensagens só chegam a quem está online.", "Você está invisível. Fique online para conversar.", …).
- `src/stores/direct-messages-storage.ts` — leitura (schema Zod local; conversa ilegível fica de fora) e escrita no storage; storage que lança deixa tudo na memória.

### Store (`src/stores/direct-messages-store.ts`)

`createDirectMessagesStore({ commands, storage, clock })`; estado `{ accountId, conversations: Record<amigo, { friendId, messages: DmSentDto[], unread }>, activeFriendId, typing: Record<amigo, true> }`.

- `signIn(conta)` lê as conversas **daquela** conta (outra conta no mesmo navegador não lê); `signOut()` apaga do aparelho todas as conversas da conta (as da memória e as do índice).
- `apply(evento)` — `sent`: entra na conversa do outro lado (minha de outra aba ou dele para mim; de quem não sou parte é ignorada), grava; mensagem do amigo desliga o "digitando" dele. `typingFrom`: liga `typing[amigo]` por 4 s, reiniciados a cada novo.
- `setActive(amigo | null)` — a conversa na tela; zera a não lida dela, e o que chegar nela já entra lido.
- `send(amigo, texto)` → `{ ok: true }` | `{ ok: false, failure, text }` (o texto volta ao campo; a frase vem do `directMessageFailureText`). A mensagem em si só aparece pelo `dm:sent`.
- `notifyTyping(amigo)` — `dm:typing` no máximo a cada 2 s por amigo.
- `forget(amigo)` — ao bloquear: apaga a conversa do aparelho. Remover amigo **não** chama (o histórico fica).
- Seletores: `selectDirectUnreadCount(estado)` (a outra metade do badge), hook `useDirectMessages(store, seletor)`.

## Status escolhido (`src/stores/presence-choice-store.ts`)

`createPresenceChoiceStore(storage)` → `{ choice: 'online' | 'invisible', away, choose, setAway }`. `choice` fica no `localStorage` (`lorkarium.presence`, por `stored-choice.ts`; outro valor vale Online); `away` não é guardado: o shell o liga junto com o `openTables.setAway` do `useTabActivity`. `linkPresenceChoice(accountRealtime, store, commands)` (`src/app/presence-link.ts`, fiado no `main.tsx` e no `testDependencies()`) manda o `presence:setVisibility` a **cada** `onConnected` (o server esquece a escolha com o socket) e a cada troca com a conexão `live`; sem conexão a troca fica só local e vai no próximo `connected`. `RealtimePresenceCommands` (`src/services/presence-commands.ts`): com o socket caído não emite; ack perdido ou recusado é engolido (a próxima conexão corrige). No `AppDependencies`: `presenceChoice`.

## Tela (`src/features/friends/`)

- `friends-route.tsx` — `friendsRoute(deps)`: `path: 'friends/:userId?'` sob o shell, sem `loader`; `FriendsPage` faz `load()` ao montar (o store junta chamadas em voo) e `setActive(userId)` na conversa aberta (`null` ao sair). `FriendsScreenDeps` (`friends-screen.ts`): `friends`, `directMessages`, `accountRealtime`, `presenceChoice`, `now`. Caminhos em `friends-path.ts` (`FRIENDS_PATH`, `friendPath(id)`).
- Layout: de `md` para cima a lista (`w-80`) ao lado da conversa; abaixo, uma coluna: `/friends` a lista, `/friends/:userId` a conversa com "Voltar". Sem conversa: "Escolhe alguém pra conversar".
- `friends-list.tsx` — "Amigos" (h1) + "Adicionar" (abre o `AddFriendForm`), a frase da última ação (`role="status"`, ou `role="alert"` na recusa; as duas regiões ficam montadas), abas Todos / Online / "Pedidos (n)" / Bloqueados. Antes da primeira leitura: skeleton (`friends-list-states.tsx`); falha sem lista: "Não deu para carregar seus amigos." + "Tentar de novo".
- `friend-groups-list.tsx` + `src/lib/friend-groups.ts` — grupos Online · Ausente · Offline com a contagem (`FriendsSection`), por apelido; a aba Online deixa o offline de fora. Busca (`matchesFriendQuery`): pedaço do apelido ou do @, sem acento, caixa nem o "@". Vazio: "Ainda sem amigos. Bora adicionar alguém?" / "Ninguém online agora." / "Ninguém com “x”.".
- `friend-row.tsx` — a linha inteira é o link da conversa ("Conversar com Bia, online"), com o `PresenceDot`, "Na mesa X" em dourado (mesa pública) e a contagem de não lidas; `friend-row-menu.tsx` ("Opções de Bia"): Mandar mensagem, Remover amigo, Bloquear — os dois últimos pelo `FriendConfirmDialog` (`AlertDialog`). Bloquear chama `directMessages.forget`; remover não (a conversa fica).
- `username-form.tsx` — campo de @ exato com botão, validado pelo `typedUsernameDto` antes de sair (inválido: "Esse @ não é válido."); a recusa fica sob o campo (`role="alert"`) e mantém o texto. Usado por `add-friend-form.tsx` ("Pedido enviado pra @x." / "Você e @x agora são amigos." quando ele já tinha pedido) e pela aba Bloqueados ("Bloquear pelo @").
- `friend-requests-tab.tsx` — Recebidos (Aceitar, Recusar, "Recusar e bloquear" com confirmação) e Enviados (Cancelar), com "há 2 h" (`sinceLabel` sobre `deps.now()`). `blocked-tab.tsx` — explicação, bloquear pelo @, Desbloquear (não volta a ser amigo).
- Frases de recusa: `src/lib/friends-failure-text.ts` (`friendsFailureText(falha, @)`; os tetos citam o número).
- Conversa: `friend-conversation.tsx` (quem não é mais amigo → `Navigate` para `/friends`), `conversation-header.tsx` (Voltar abaixo de `md`, @ · status ou "Na mesa X"), "Reconectando…" (`role="status"`) com o socket fora de `live` (`use-account-status.ts`, `useSyncExternalStore` sobre o `AccountRealtime`), `conversation-feed.tsx` (`src/lib/direct-feed.ts`: separador por dia local — "Hoje", "Ontem", "3 de novembro" —, blocos do mesmo autor com até 5 min entre si, `CHAT_BLOCK_GAP_MS` do chat da mesa, hora no fim do bloco, as minhas à direita), "Bia está digitando…" (`aria-live`), `conversation-composer.tsx` (Enter envia, Shift+Enter quebra, `notifyTyping` ao digitar, recusa em `role="alert"` com o texto de volta). Campo desligado, com o porquê no rodapé: sem conexão; eu invisível ("Você está invisível. Fique online para conversar."); amigo offline ("Bia está offline. Mensagens só chegam a quem está online."). Ausente pode receber.
- Trilho: `use-shell-friends.ts` — `useFriendsBadge(friends, directMessages)` e `useUserMenuPresence(presenceChoice)`, usados pelo `shellRoute` ([`home.md`](home.md)).

Specs da tela: `test/features/friends/{friends-route,friend-conversation,use-shell-friends}.spec.tsx`, `test/lib/{friend-groups,direct-feed,friends-failure-text}.spec.ts`, `test/stores/presence-choice-store.spec.ts`, `test/services/presence-commands.spec.ts`, `test/app/presence-link.spec.ts`, os casos de status em `test/app/shell/user-menu.spec.tsx`. Specs dos dados: `test/services/{friends-api,friends-events,direct-message-commands,direct-message-events}.spec.ts`, `test/stores/{friends-store,direct-messages-store}.spec.ts`, `test/lib/{direct-conversations,direct-message-failure-text}.spec.ts`, `test/app/account-link.spec.ts`; fixtures em `test/support/friends-fixtures.ts`.
