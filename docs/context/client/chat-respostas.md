# Client — responder mensagem

Índice: [`../client.md`](../client.md). Responder uma mensagem como no Discord, no chat da mesa ([`chat.md`](chat.md)) e nas privadas entre amigos ([`friends.md`](friends.md)). Contrato: `chatReplyDto` em [`../contracts/chat.md`](../contracts/chat.md) e `replyToMessageId` em [`../contracts/amigos.md`](../contracts/amigos.md).

## Por que só o id

Nada é gravado no server: o evento leva só o id da original, e cada client acha autor e texto no **próprio** histórico. Quem não tem a original (chegou depois, F5 fora da visita, teto de 300/200 mensagens) vê "Mensagem original indisponível". Assim ninguém forja uma citação de outra pessoa — o texto citado nunca viaja.

## Regras (`src/lib/chat-replies.ts`)

- `ChatReplyDraft` `{ message: ChatMessage, mention }` — a mensagem sendo respondida no campo.
- `chatReplyOf(draft, viewerId)` → `chatReplyDto | null`: o id e, com o @ ligado e autor diferente de quem responde, `mentionUserId` = autor.
- `replyWhisperToOf(event, viewerId)` — **mesmo canal da original**: sussurro é respondido no mesmo sussurro (para quem dos dois não é o leitor); o resto, à Mesa toda. Privado e grupo já são a própria conversa.
- `repliesToViewer(event, viewerId)` — a resposta chama o leitor (`mentionUserId` = ele, e não foi ele quem escreveu). Entra no `callsViewer` de `chat-conversations.ts`, a regra única do dourado: contador, aviso importante, som e o traço da linha.
- `messagesByIdOf(messages)` — o `Map` por id que o feed monta uma vez (`useMemo`) para cada resposta achar a original.

## Tela

- `src/components/message-reply.tsx` (compartilhado pelos dois feeds): `ReplyQuote` (espinha + autor + primeira linha; botão "Ir para a mensagem de Bia: …" que rola e pisca a original; sem original, o aviso em itálico), `ReplyButton` ("Responder Bia", aparece no hover/foco do `group`), `replyOnDoubleClick(onReply)` (o `onDoubleClick` da linha do chat e da bolha da privada: responde, menos sobre um controle dentro dela — nome, imagem, citação — e solta a palavra que o duplo clique selecionou), `ReplyBar` ("Respondendo a Bia", o @ com `aria-pressed` — "Mencionar Bia" — e "Cancelar resposta") e `jumpToMessage(de, id)`: acha o `[data-message-id]` dentro do `[data-message-list]` mais próximo (a janela destacada procura no próprio documento), `scrollIntoView` no centro e `data-flash` por 1,5 s (`data-[flash]:bg-primary/20`).
- Chat da mesa: `use-chat-reply.ts` (`useChatReply(chave)`, no `OpenChat` do `chat-panel.tsx`; trocar de conversa esquece, `start` estável para o `memo` das linhas). `ChatFeed` recebe `onReply`; `ChatMessageRow` recebe `quoted` (`null` = sem resposta ou original ausente) e `onReply`, tem `data-message-id`, e resposta nunca é linha "continuada". `chatVoiceNameOf(event, people)` dá o nome (token ou autor). No `ChatComposer`, a barra acima do campo; o @ só aparece respondendo outra pessoa; "Pra quem" fica desligado e mostra o canal da original (`whisperChosenOf` no `use-chat-composer.ts`); Esc no campo cancela (antes de fechar a gaveta); enviar com sucesso cancela. `/w` e rolagens saem sem `replyTo`.
- Privadas: `features/friends/use-direct-reply.ts` (`useDirectReply(amigo)`), `ConversationFeed` com `onReply`, citação acima do balão e o botão ao lado; `ConversationComposer` com a barra (sem @: o amigo sempre recebe), Esc cancela, foco no campo ao começar. `DirectMessageCommands.send(amigo, texto, replyToMessageId)` e o `send` da store levam o id.

## Testes

`test/lib/chat-replies.spec.ts` (regras e `callsViewer`), `test/features/chat/chat-replies.spec.tsx` (pelo `ChatPanel`: barra e foco, @ ligado/desligado, Esc e X, sussurro respondido no mesmo sussurro com "Pra quem" travado, citação que pisca a original, original ausente, menção pela resposta) e o bloco "answering a message" de `test/features/friends/friend-conversation.spec.tsx`. Server: `chat.service.spec.ts` e `direct-messages.{service,mapper}.spec.ts` (repasse).
