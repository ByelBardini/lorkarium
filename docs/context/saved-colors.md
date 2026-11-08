# Saved colors

As cores que uma conta guarda para reusar em qualquer seletor, em qualquer mesa, no site e no app desktop. Vive em `server/src/modules/saved-colors/`. DTOs em [`contracts/conta.md`](contracts/conta.md).

A lista é **dado pessoal, sem vínculo com o que foi pintado**: cada desenho, luz ou token guarda a própria cópia do hex, então excluir uma cor da lista não repinta nada. Não há evento em tempo real: não afeta a mesa, e o client relê a lista a cada abertura do popover.

## Tabela `account_saved_colors` (migração `0083_saved_colors`)

| Coluna       | Tipo                                       | Regra                                                         |
| ------------ | ------------------------------------------ | ------------------------------------------------------------- |
| `user_id`    | `uuid`, FK `users.id`, `ON DELETE CASCADE` | apagar a conta apaga a lista                                  |
| `color`      | `text`                                     | `CHECK account_saved_colors_color_hex` (`~ '^#[0-9a-f]{6}$'`) |
| `created_at` | `timestamptz`, `DEFAULT now()`             | a ordem da lista                                              |

PK `(user_id, color)`: é ela que garante "sem repetição" e atende a leitura por conta (são no máximo 24 linhas por conta, sem índice próprio para a ordem).

## Estrutura

- `saved-colors.po.ts` — a tabela; `SavedColorPo`. A coluna é `` `#${string}` `` sem importar o DTO (seta proibida para o PO)
- `saved-colors.dao.ts` — `SavedColorsDao(db | tx)`, toda consulta chaveada pela conta: `lockOwner(userId)`, `listOf(userId)` (mais recente primeiro; empate pela cor), `insertIfAbsent(userId, color)` → a linha ou `undefined` se já havia, `remove(userId, color)` (idempotente)
- `saved-colors.bo.ts` — `SavedColorAdmissionBo(maxSaved).mustInsert(salvas, cor)`: `false` se já guardada (mesmo com a lista cheia), `true` se há espaço, lança `SavedColorsLimitError` se não há
- `saved-colors.mapper.ts` — `toSavedColorsResponse(rows)`
- `saved-colors.service.ts` — `SavedColorsService`: `list`, `save`, `remove`; toda resposta é a lista inteira
- `saved-colors.routes.ts` — as três rotas; `saved-colors.plugin.ts` — `createSavedColorsModule({ db })`, registrado no `buildApp` sob `/api`
- `saved-colors.error.ts` — `SavedColorsError` com `code` `SAVED_COLORS_LIMIT` | `RATE_LIMITED` (`SavedColorsLimitError(keptCount, limit)`, `SavedColorsRateLimitedError(retryAfterSeconds)`)

## Contrato (prefixo `/api`, todas exigem sessão)

Resposta de sucesso das três: 200 `savedColorsResponseDto` `{ colors }`, mais recente primeiro.

| Rota                                  | Entrada                                                  | Erros                                                                    |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /account/saved-colors`           | —                                                        | 401                                                                      |
| `POST /account/saved-colors`          | `saveColorRequestDto` `{ color }` (estrito, normalizado) | 400 `INVALID_BODY` · 401 · 409 `SAVED_COLORS_LIMIT` · 429 `RATE_LIMITED` |
| `DELETE /account/saved-colors/:color` | `savedColorParamsDto`: o hex **sem `#`** (`/aabbcc`)     | 400 `INVALID_BODY` · 401 · 429 `RATE_LIMITED`                            |

- A conta é sempre a da sessão: um `userId` no corpo é 400 (DTO estrito).
- Salvar o que já está na lista responde 200 com a lista igual, sem subir a cor para o topo. Excluir o que não está também responde 200.
- Limite: **30 escritas por minuto e por usuário**, somando `POST` e `DELETE` (um contador só, `app.rateLimit` na `preHandler`, depois da guarda). `GET` não conta.
- Teto: `SAVED_COLORS_MAX` = 24 por conta. No limite, salvar é recusado: nada some sem a pessoa decidir.

## A corrida do teto

`save` abre a transação e trava a linha da conta em `users` com `FOR NO KEY UPDATE` **antes** de contar e inserir (`lock → list → insert → commit`): 30 `POST` paralelos deixam exatamente 24 linhas e seis 409. O modo não conflita com o `FOR KEY SHARE` que as FKs de outras tabelas tomam ao apontar para a conta, então salvar uma cor não segura nenhum comando de mesa. A resposta soma a linha nova à lista lida, sem reler.

`remove` não precisa da transação: é uma linha só, e a lista relida depois dele é a resposta.

## Testes

- Contrato: `packages/contracts/test/account/saved-colors.dto.spec.ts`.
- Unit: `server/test/modules/saved-colors/saved-colors.bo.spec.ts` e `saved-colors.service.spec.ts` (diário das chamadas). Fakes em `server/test/support/saved-colors-fakes.ts`: `savedColorPo`, `SavedColorsDaoFake`, `SavedColorsTransactionRunnerFake`.
- Integração: `server/test/integration/saved-colors-dao.spec.ts` (ordem, repetição, cascade, `CHECK`, isolamento, modo da trava por `NOWAIT`) e `saved-colors.spec.ts` (borda: as três rotas, 409, 30 `POST` paralelos, 401, 400, 429, isolamento).
