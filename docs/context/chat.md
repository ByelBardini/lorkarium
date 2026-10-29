# Chat

O chat da sala: a Mesa (a mesa toda), o sussurro inline na Mesa, a conversa privada com uma pessoa e o grupo fixo. É **efêmero**, como os dados ([`dice.md`](dice.md)): não grava, não soma versão, não entra no snapshot; o histórico vive só no client, durante a visita à mesa. Os DTOs estão em [`contracts/chat.md`](contracts/chat.md). Plano de origem: `docs/plans/2026-10-27-tela-chat-da-mesa.md` (fases 2–4 = este server).

## Regras de negócio

- **Quem manda:** todo membro, **o espectador incluso** (conversa, mas não joga). Quem está fora da mesa recebe `CAMPAIGN_NOT_FOUND` antes de qualquer outra conferência (critério 14). O autor é o da sessão (§7.3), nunca o payload (`userId` forjado → `INVALID_BODY`).
- **Para quem:**
  - Mesa sem sussurro (`{ kind: 'table', whisperTo: null }`) → a mesa toda.
  - Sussurro (`whisperTo` = um membro) → só quem mandou e quem recebe.
  - Privado (`{ kind: 'direct', userId }`) → só os dois.
  - Grupo (`{ kind: 'group', groupId, name, memberIds }`) → só os membros; quem manda **tem de estar** em `memberIds` (`CHAT_SENDER_NOT_IN_GROUP`). Nome e membros viajam em cada mensagem; o server não guarda grupo nenhum, só confere os membros.
- **O mestre não vê** sussurros, privados nem grupos dos outros: o server nem emite para outras conexões.
- Todo destinatário (o sussurrado, o do privado, cada membro do grupo menos quem manda) tem de ser membro **desta** mesa, espectador valendo: senão `CHAT_RECIPIENT_NOT_MEMBER`, citando o id e "a member of the campaign". Sussurro ou privado para si mesmo → `CHAT_RECIPIENT_IS_SENDER`.
- **Falar como token** (`speaker: { kind: 'token', sceneId, tokenId }`) — decisão da fase 2: **só na Mesa sem sussurro**. Em sussurro, privado ou grupo → `CHAT_SPEAKER_NOT_ALLOWED` (um personagem fala para a mesa; a conversa à parte é da pessoa). Na Mesa:
  - espectador → `FORBIDDEN` (antes de ler o token);
  - o grid tem de estar aberto **nesta conexão** (a sala do grid, como no ping): senão `SCENE_NOT_FOUND`, nunca `FORBIDDEN` — é também a prova de que o grid é desta mesa, sem consulta;
  - token ausente do grid → `TOKEN_NOT_FOUND`;
  - jogador só como token que controla; mestre como qualquer token do grid (`TokenAccessBo.requireControl('speak as')` → `FORBIDDEN`);
  - o evento leva o `name` **lido do banco** (`TokensDao.findInScene`), nunca um nome do client.
- Ordem das conferências: mesa → canal × quem fala → público (si mesmo, grupo) → membros destinatários → token (grid, existência, controle). Nada é publicado em nenhuma recusa.
- `messageId` vem do `newId` (`randomUUID`) e `at` do `ClockPort`.

## Estrutura (server)

- `server/src/modules/chat/` — módulo efêmero (sem PO nem DAO), no molde do `dice`/`pings`:
  - `chat-message.bo.ts` — `ChatMessageBo(senderId, channel)`: `audience()` → `{ kind: 'table' }` | `{ kind: 'people', userIds }` (quem manda incluso), `recipientIds()` (os outros, para conferir), `requireSpeaker(speaker, access)`. Tipos próprios `ChatChannel`, `ChatSpeaker`, `ChatAudience` (o BO não importa DTO; o DTO cabe estruturalmente).
  - `chat.service.ts` — `ChatService.send(userId, command, connectionId)` → `{ messageId }`; deps `{ members, audience, tokens, publisher, clock, newId }`.
  - `chat.mapper.ts` — `toChatSentChannelDto(channel, senderId)` (o privado vira `{ kind: 'direct', userIds: [a, b] }` em ordem crescente), `toChatTokenSpeakerDto(token, name)`, `toChatSentDto`.
  - `chat-publisher.port.ts` — `ChatPublisherPort.sent(event, audience)`.
  - `chat.error.ts` — `ChatError` e as quatro recusas (tabela abaixo).
  - `chat.gateway.ts` — `createChatGateway` (`chat:send`); `chat.plugin.ts` — `createChatModule({ members, audience, tokens, publisher, clock, newId, realtime, rate, log })` → `{ gateway }`.
- **Sem `chat-speaker.port.ts`** (o plano previa): o service usa a `GridAudiencePort` do `pings` (estar na sala do grid) e `Pick<TokensDao, 'findInScene'>`, como o `dice` usa `Pick<ProfilesDao, 'findById'>`. Uma porta a mais só embrulharia os dois.
- `server/src/app/wire-chat.ts` — `wireChat(realtime, { db, members, clock, log })`, chamado no `wireRealtime` do `build-app.ts` logo depois do `wireDice`: `SocketIoGridAudience`, `new TokensDao(db)`, `SocketIoChatPublisher`, `randomUUID` e um `CommandRateGuard` com `CHAT_RATE`.
- `server/src/infrastructure/chat-publisher/socket-io-chat-publisher.ts` — `SocketIoChatPublisher.sent` (salas abaixo).

## Salas

| Mensagem                 | `chat:sent` vai para                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Mesa sem sussurro        | `campaignRoom(campaignId)` (a mesa toda, quem mandou incluso)                                                             |
| Sussurro, privado, grupo | `campaignChatRoom(campaignId, userId)` de cada pessoa do público, num `to([...])` só (um socket em várias recebe uma vez) |

- `campaignChatRoom(campaignId, userId)` → `campaign:<id>:chat:<userId>` (`server/src/realtime/rooms.ts`). Diferente da `campaignUserRoom` (que recebe o tabuleiro sem censura e **exclui o espectador**), a de chat é de **todo** membro: o `session:join` põe o socket nela junto com a da mesa (`audienceRoomsOf` em `sessions.gateway.ts`). Toda aba da pessoa ouve; a troca de papel não a mexe; sair da mesa (`session:leave`, remoção, mesa excluída) a deixa pelo `isRoomOfCampaign`.
- Outra mesa não ouve nada (critério 14): toda sala é nomeada sob a mesa.

## Contrato e erros no ack

`chat:send` (`chatSendCommandDto`) → `{ ok: true, messageId }` | `{ ok: false, error }`. O resultado chega a todos (quem mandou incluso, em todas as abas) por `chat:sent` (`chatSentDto`, **sem versão**).

| Código                             | Quando                                                 | Mensagem pública                                      |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `CAMPAIGN_NOT_FOUND`               | fora da mesa, ou mesa não aberta nesta conexão         | `Campaign not found`                                  |
| `FORBIDDEN`                        | espectador como token; token que a pessoa não controla | `Your role at this table does not allow it`           |
| `CHAT_SPEAKER_NOT_ALLOWED`         | token em sussurro, privado ou grupo                    | `A character only speaks to the whole table`          |
| `CHAT_RECIPIENT_NOT_MEMBER`        | destinatário fora desta mesa                           | `That person is not at this table`                    |
| `CHAT_RECIPIENT_IS_SENDER`         | sussurro ou privado para si                            | `A private message needs someone else`                |
| `CHAT_SENDER_NOT_IN_GROUP`         | grupo sem quem manda                                   | `You are not in this group`                           |
| `SCENE_NOT_FOUND`                  | token de um grid que esta conexão não tem aberto       | `Scene not found`                                     |
| `TOKEN_NOT_FOUND`                  | token que não está no grid                             | `Token not found`                                     |
| `RATE_LIMITED`                     | balde do chat vazio (com `retryAfterSeconds`)          | `Too many commands in a row`                          |
| `INVALID_BODY` / `UNAUTHENTICATED` | DTO recusado / sessão vencida                          | do `invalidBodyError` / `A valid session is required` |

A mensagem interna (no log) cita o valor recebido e a forma esperada; o ack leva só a pública, do `PUBLIC_MESSAGE` do `board-command-edge.ts`, onde o `ChatError` entrou no `isKnown`. Nome, cor e foto do autor vêm do roster no client, não do evento.

## Caminho do comando

`chat.gateway` → `onCommand` do `board-command-edge.ts` (balde do chat → DTO → sessão relida → mesa aberta na conexão → ack), **fora** da `CampaignCommandQueue` (nada é gravado) → `ChatService.send`: `viewerAccessOf` sobre o `CachedMemberships` → `ChatMessageBo` → `findMembership` de cada destinatário (em memória depois da primeira leitura) → se token: `GridAudience.reaches` → `TokensDao.findInScene` (a **única** consulta possível ao banco) → `TokenAccessBo` → mapper → publicador.

## Balde

`CHAT_RATE` `{ burst: 8, perSecond: 2 }` em `server/src/realtime/command-rate.bo.ts`, num `CommandRateGuard` **só do chat**: a 9ª mensagem de uma rajada é `RATE_LIMITED`, e um `dice:roll` (ou comando do tabuleiro) logo depois passa. A recusa é o `CommandRateLimitedError` do `board.error`.

## Por que não grava

Pedido do usuário: o chat é como as rolagens — o histórico é do client (`sessionStorage`, some ao fechar a mesa) e quem chega depois começa vazio. "Persistir antes de confirmar" (§5.5) não se aplica: depois do evento nada fica como estado compartilhado, e o `board:sync` antes e depois tem a mesma versão.

## Testes

- Unit: `server/test/modules/chat/chat-message.bo.spec.ts` (público por canal, si mesmo, grupo sem quem manda, quem pode falar como token), `chat.service.spec.ts` (`ChatPublisherFake` em `server/test/support/chat-fakes.ts`, `GridAudienceFake`, `TokensDaoFake`, `MembershipReadsFake`, `ClockFake`: evento completo, par ordenado, Quelm `CAMPAIGN_NOT_FOUND` antes de ler o resto, destinatário de outra mesa, token fora do grid aberto / ausente / sem controle, nome lido do grid) e `chat.mapper.spec.ts`; `server/test/realtime/rooms.spec.ts` (`campaignChatRoom`) e `command-rate.bo.spec.ts` (`CHAT_RATE`).
- Integração: `server/test/integration/chat.spec.ts` (`useTokenTable` + Duda espectadora + Eli só em Quelm): Mesa ouvida por Ana, Bia, Caio e Duda; sussurro Bia→Caio sem Ana (mestre) nem Duda; privado Caio→Bia com o par ordenado, sem Ana; grupo nas duas abas da Bia, sem Ana; Duda manda na Mesa e recebe privado; Lyra com o nome do grid; Duda e Caio como Lyra `FORBIDDEN`; token em sussurro `CHAT_SPEAKER_NOT_ALLOWED`; `userId` forjado `INVALID_BODY`; Eli `CHAT_RECIPIENT_NOT_MEMBER`; si mesmo e grupo sem quem manda pelos códigos; Eli não ouve Vharn e recebe `CAMPAIGN_NOT_FOUND` (critério 14); a 9ª da rajada `RATE_LIMITED`, versão do board igual, `dice:roll` passa.
- O gateway não tem unit: a integração o prova.
- E2E: `e2e/test/chat.spec.ts` (grupo `table`), cinco cenários: Mesa e sussurro, privado e grupo sem acesso do mestre, `/r` e salva `/ataque`, fala de personagem com balão temporário no canvas remoto, janela separada com envio e retorno. Na retomada de 2026-10-28, os cinco passaram em três fragmentos sequenciais; os 14 cenários de integração também passaram em Postgres e S3 descartáveis.
