# Client · rolagem dos feeds de mensagens

Índice: [`../client.md`](../client.md) · chat: [`chat.md`](chat.md) · amigos: [`friends.md`](friends.md).

Os dois feeds de mensagens — o `ChatFeed` da mesa (`role="log"` "Mensagens: …", na gaveta, no painel, no celular e na janela destacada) e o `ConversationFeed` das privadas entre amigos — seguem o fim pelo mesmo hook, `src/components/use-follow-bottom.ts`.

## Regra

- **No fim** (folga de 24 px, `PINNED_SLACK_PX`, para arredondamento e inércia): item novo rola até ele, e o conteúdo que cresce depois de montar (o cartão da rolagem se revelando, um avatar carregando) também, por `ResizeObserver` sobre o miolo.
- **Rolado para cima:** item novo de outra pessoa **não** mexe na posição; aparece o aviso "Novas mensagens ↓". Crescer o conteúdo também não mexe.
- **Item meu** (mensagem que mandei, rolagem minha na Mesa) leva ao fim mesmo rolado para cima.
- **Voltar ao fim** (rolando ou pelo aviso) esconde o aviso e religa o seguir.
- Ao montar (abrir a conversa, trocar de conversa) começa no fim.

## Peças

- `useFollowBottom({ key, mine })` → `{ scroller, content, hasUnseen, jumpToEnd }`. `key` é a chave do **último** item (`null` vazio), não a contagem: no teto do histórico (`CHAT_HISTORY_LIMIT`) a contagem para de mudar e o item novo ainda chega. `mine` diz se o último é de quem lê. O estado de "preso no fim" é ref (o evento de rolagem atualiza); `hasUnseen` vem de um estado gravado ao sair do fim (a chave mais nova naquele momento) — é verdadeiro quando a chave atual difere dela e o último não é meu. Sem `setState` em efeito (regra do `react-hooks` 7).
- Desestruturar o retorno (`const { scroller, content, … } = useFollowBottom(…)`): ler `follow.scroller` no JSX faz o lint do compilador acusar "Cannot access refs during render" em todo o objeto.
- `src/components/new-messages-notice.tsx` — `NewMessagesNotice({ onJump })`: botão "Novas mensagens" com `ArrowDown` (`aria-hidden`), `absolute bottom-2` centrado, `rounded-sm`, borda `border`, fundo `card`, texto `primary` em `text-xs`; sem pílula e sem sombra (elevação é a superfície `card`). O pai embrulha o feed num `relative flex min-h-0 flex-1 flex-col`.
- `ChatFeed`: `latestOf(itens, people.viewerId)` — chave por `keyOf` e autor por `fromUserId` (mensagem) ou `rollerId` (rolagem).
- `ConversationFeed`: chave `messageId` da última, `mine` por `fromUserId === accountId`. O scroller (`data-message-list`) existe sempre, inclusive vazio (o "Nenhuma mensagem com Bia ainda…" fica dentro dele): o efeito que escuta a rolagem monta uma vez só e precisa do elemento desde o início.

## Testes

- `test/components/use-follow-bottom.spec.tsx` — o hook isolado com `ResizeObserver` fake: crescer no fim/rolado, item novo no fim/rolado, item meu rolado, sem novidade sem aviso, voltar ao fim religa, o aviso leva ao fim e religa.
- `test/features/chat/chat-feed-scroll.spec.tsx` — pelo `ChatPanel` (harness): no fim rola, rolado fica e mostra o aviso, a minha leva ao fim, voltar ao fim religa, o aviso leva ao fim.
- `test/features/friends/conversation-feed.spec.tsx` — o `ConversationFeed` direto: no fim rola, rolado fica com aviso, a minha leva ao fim, vazio ainda diz que ninguém falou.
- O jsdom não mede: os specs definem `scrollHeight`/`clientHeight` à mão e disparam `scroll` depois de mudar `scrollTop`.
