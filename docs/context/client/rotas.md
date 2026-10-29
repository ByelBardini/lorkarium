# Client — rotas

Índice em [`../client.md`](../client.md). Antes de mexer numa rota do React Router 8, ler `client/node_modules/react-router/docs/`.

| Caminho                                   | Acesso        | Tela                                                                                                                                    |
| ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                  | `public-only` | `LoginPage`; logado vai para o `next` seguro ou `/`                                                                                     |
| `/account`                                | `signed-in`   | shell + "Minha conta" ([`client/account.md`](account.md))                                                                               |
| `/account/email/confirm`                  | `anyone`      | confirmação da troca de e-mail (fora do shell)                                                                                          |
| `/`                                       | `signed-in`   | shell + `HomePage` (`loader` da lista, `action` de criar/entrar por código)                                                             |
| `/campaigns/:campaignId`                  | `signed-in`   | a home com o modal de detalhes por cima (`loader` do detalhe, `action` de "Entrar na mesa")                                             |
| `/campaigns/:campaignId/table`            | `signed-in`   | shell (trilho compacto) + sala de jogo (`loader` do detalhe, `handle: COMPACT_RAIL_HANDLE`)                                             |
| `/campaigns/:campaignId/table/library`    | `signed-in`   | biblioteca em modal sobre a sala ([`client/library.md`](library.md))                                                                    |
| `/campaigns/:campaignId/table/settings`   | `signed-in`   | "Configurações da mesa": página sobre a sala, só o mestre; jogador volta à sala ([`client/campaign-settings.md`](campaign-settings.md)) |
| `/campaigns/:campaignId/table/conditions` | `signed-in`   | "Condições da mesa": página sobre a sala, só o mestre; jogador volta à sala ([`client/conditions.md`](conditions.md))                   |
| `/account/recover`                        | `anyone`      | recuperação pelo link "Não fui eu" (fora do shell)                                                                                      |
| `/invite` · `/reset-password`             | `anyone`      | aceitar convite · nova senha pelo link do admin (fora do shell)                                                                         |
| `/admin` → `/admin/users`                 | `admin`       | backoffice, `lazy` (fora do shell): moldura própria + "Usuários"                                                                        |
| `*`                                       | —             | redireciona para `/`                                                                                                                    |

- O root tem `middleware` que faz o `GET /api/auth/me` enquanto a sessão está `unknown` (repetido enquanto o server não responde) e o `HydrateFallback` (splash) cobre essa espera. Cada rota tem um `middleware` de guarda que chama `decideAccess` e lança `redirect`; as rotas logadas vivem sob a rota de layout `shell` (sem `path`, guarda `signed-in`).
- A rota `shell` tem um segundo `middleware`, `restoreOpenTables`: com a sessão autenticada, `openTables.restore(user.id)` (idempotente) reabre as mesas da aba depois de um F5. "Sair" no menu chama `openTables.closeAll()` **antes** do `authApi.logout()` (depois, o server recusaria os `session:leave` e os outros só veriam a saída depois da tolerância).
- Árvore: `root` → `login` · `account/email/confirm` · `account/recover` · `invite` · `reset-password` · `admin` → [índice, `users`] · `shell` → [`home` (`path: '/'`) → [índice, `campaigns/:campaignId`], `account` (id `account`), `campaigns/:campaignId/table` (id `campaign-table`) → [índice, `library`, `settings`]] · `*`.
- Visitante em rota protegida vai para `/login?next=<caminho+query codificados>`; depois do login, `safeRedirectTarget(next)`. `loader`/`action` que recebe `unauthenticated` faz o mesmo (`redirectIfSignedOut`), menos a `action` chamada por **fetcher**: ela lança para o `ErrorBoundary`, que rende o `SignedOutRedirect` (ver [`client/armadilhas.md`](armadilhas.md)).
- A guarda do client só evita mostrar a tela errada; quem recusa é o server.
