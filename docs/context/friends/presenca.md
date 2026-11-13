# Presença da conta

Status que os amigos veem de cada conta, com ou sem mesa aberta. Regra pura em `server/src/modules/account-presence/account-presence.bo.ts` (`AccountPresenceBo`), no molde do `TablePresenceBo` da mesa (`docs/context/sessions.md`): recebe o estado de **uma conta**, devolve `{ state, change }` e nunca muta. DTOs em `packages/contracts/src/friends/presence.dto.ts`.

## Estado (`AccountPresence`)

| Campo        | O quê                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| `sockets`    | sockets abertos da conta (todas as abas)                               |
| `still`      | sockets parados (o mesmo sinal do `session:setActivity`)               |
| `inGrace`    | caiu o último socket por queda e ainda pode voltar                     |
| `visibility` | `online` ou `invisible`, escolha da conta (vale para todas as abas)    |
| `tables`     | `{ socketId, table: { campaignId, name, isPublic } }`, mais antiga 1.º |

## Status visto (`seen()`)

- `invisible` → `offline` e `table: null`, mesmo com sockets abertos.
- Sem socket e fora da tolerância → `offline`.
- Todos os sockets parados → `away`; senão `online`. Uma aba ativa basta.
- `table`: a **última mesa pública** aberta em algum socket ainda vivo; mesa privada não aparece (`null`). Fechar a última volta à pública anterior; o socket que cai leva as mesas dele.
- `isVisiblyOnline()`: `online` ou `away` como os amigos veem (quem pode receber mensagem privada).

## Mudanças

`connect` (`came-online`, `already-online`, `returned-in-grace`, `came-back`), `disconnect(socketId, 'left' | 'dropped')` (`still-online`, `went-away`, `went-offline`, `grace-started`), `expireGrace` (`went-offline`, `already-back`), `markAway`/`markActive` (`went-away`, `still-active`, `already-away`, `came-back`), `setVisibility` (`visibility-changed`/`-unchanged`), `openTable`/`closeTable` (`table-opened`, `table-closed`, `table-unchanged`). Socket desconhecido → `not-connected`, com o mesmo estado (idempotente).

O `change` diz o que houve na conta; **se os amigos devem ouvir** é `seenPresenceChanged(before, after)`, que compara o `seen()` (status e mesa mostrada). Assim invisível que fica ausente, ou segunda aba, não publica nada, e voltar de invisível para online publica.

## Tolerância

`disconnect(..., 'dropped')` do último socket inicia a tolerância (ainda `online`); quem a cronometra é o serviço, pelo `SchedulerPort` (5 s, como a mesa), chamando `expireGrace()`. `left` (logout) sai na hora.

## Por que memória

Presença é efêmera e muda a cada aba: `AccountPresenceRegistryPort` (`presenceOf`, `save`), síncrono para o serviço ler, decidir e gravar sem `await` no meio. Adaptador `InMemoryAccountPresenceRegistry` (`server/src/infrastructure/account-presence-registry/`): um `Map` por `userId`; conta vazia (sem socket nem tolerância) é apagada — a visibilidade escolhida é reenviada pelo client a cada conexão. Várias instâncias do server pedem um store compartilhado com atualização atômica.

Serviço, gateway e eventos: [`presenca-ao-vivo.md`](presenca-ao-vivo.md).
