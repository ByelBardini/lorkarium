# Planos — o Dono do Lorkarium e o selo

## Dono do Lorkarium (`OWNER_USERNAME`)

Não é plano: é a conta cujo @ está na env opcional `OWNER_USERNAME` do server (sem o `@`, formato do `usernameDto`; vazia = ninguém). O @ e não o e-mail porque o e-mail fica cifrado no banco e o @ é o que uma consulta compara. Efeito: os limites efetivos do `amigo_do_dono` (sem teto de plano, como o admin) e a personalização da conta liberada, qualquer que seja o plano gravado. Selo próprio, acima de todos.

- A regra mora num lugar: `effectiveLimitsOf({ role, plan, lorkariumOwner })` (`plan-limits.bo.ts`) dá `PLAN_LIMITS.amigo_do_dono` para `role = 'admin'` ou `lorkariumOwner`; `customizationAllowed` segue. O BO não lê env.
- Quem diz se a conta é a Dona:
  - nas consultas: `lorkariumOwnerSql(users.username)` (`server/src/database/lorkarium-owner-sql.ts`) = `coalesce(username = current_setting('lorkarium.owner_username', true), false)`. O @ vai em toda conexão do pool como opção de partida (`-c lorkarium.owner_username=<@>`, `ownerUsernameStartupOptions`, montado no `createDatabase` com `ownerUsername`; o `src/index.ts` passa `env.ownerUsername`). Assim os ~30 serviços que leem o plano do dono na trava não recebem a env: toda leitura de `UserPlanPo` usa `PLAN_ACCOUNT_COLUMNS` (`users.dao.ts`: `role`, `plan`, `lorkariumOwner`), inclusive o alias do dono no `campaign-members.dao.ts`. Também o `ProfileRow` e o `AccountListingRow` do backoffice.
  - no `/me` (login, sessão, convite, 2FA), onde a linha inteira do `users` já está à mão: `isLorkariumOwner(username, ownerUsername)` no `toAuthUserDto(row, cipher, ownerUsername)`; o `AuthService` recebe `ownerUsername` nas deps (do `env` no `auth.plugin.ts`).
- Fora de uma conexão com a opção (script, outro pool), ninguém é o Dono.
- DTOs com `lorkariumOwner: boolean`: `authUserDto`, `adminUserDto`, `profileDto`, `sessionMemberDto` (e `memberJoined`/`memberUpdated`), `campaignMemberDto`.
- Provado em `server/test/integration/lorkarium-owner.spec.ts` (o @ certo vira Dono: `/me`, 2ª mesa no Grátis, limites da mesa, roster, detalhe, perfil, backoffice; outro @ não; env vazia ninguém), `server/test/database/lorkarium-owner-sql.spec.ts`, `plans/plan-limits.bo.spec.ts`, `auth/auth.mapper.spec.ts` e `server/test/config/env.spec.ts`. Spec de integração que precise do Dono abre o banco com `openTestDatabase({ ownerUsername })` e o app com `{ ...env, ownerUsername }`.

## Os campos do selo

Os DTOs de membro (`sessionMemberDto`, `campaignMemberDto`) e o `profileDto` levam o plano **gravado** (nunca o efetivo: o admin aparece com o plano dele), `admin` (`role = 'admin'`) e `lorkariumOwner`. Montados por `accountSealFieldsOf(account)` (`campaigns.mapper.ts`, usado pelo `sessions.mapper.ts`) e pelo `toProfileDto`. O `authUserDto` e o `adminUserDto` já têm `role`. Os limites efetivos (`limits` da mesa e da conta) não mudaram.

A troca no backoffice avisa as mesas vivas: plano e **papel global** (`changeRole`, `UserAdminService.tellSealAndLimits`) publicam `session:memberUpdated` (o selo) e, nas mesas de que a conta é dona, `session:campaignUpdated` (os limites: o admin não tem teto). Provado em `user-admin-plan.spec.ts` e `user-admin.service.spec.ts`.

## Um selo só (`client/src/lib/plan-seal.ts`)

`planSealOf(holder)` → `PlanSealLook | null`, o mais alto: **Dono do Lorkarium > Admin > Amigo do Dono > Lenda > Narrador > Apoiador**. O Apoiador é um plano (`apoiador`), o mais baixo dos selos; o Grátis não tem selo. `PlanSealHolder` = `{ plan, admin, lorkariumOwner }`; `sealHolderOfAccount(conta)` tira o `admin` do `role` (`/me`, backoffice). `PLAN_NAMES` = os cinco planos.

| Selo          | `kind`            | Nome acessível      | Cor      | Ícone (`plan-seal-icons.tsx`; o mapa por `kind` em `plan-seal-icon-map.ts`) |
| ------------- | ----------------- | ------------------- | -------- | --------------------------------------------------------------------------- |
| Dono          | `lorkarium_owner` | "Dono do Lorkarium" | `bone`   | a logo (`LorkariumOwnerSealIcon`)                                           |
| Admin         | `admin`           | "Administrador"     | `ember`  | espada erguida (`AdminSealIcon`)                                            |
| Amigo do Dono | `amigo_do_dono`   | "Amigo do Dono"     | `rose`   | cálice (`AmigoDoDonoSealIcon`)                                              |
| Lenda         | `lenda`           | "Plano Lenda"       | `gold`   | brasão (`LendaSealIcon`)                                                    |
| Narrador      | `narrador`        | "Plano Narrador"    | `steel`  | pena (`NarradorSealIcon`)                                                   |
| Apoiador      | `apoiador`        | "Apoiador"          | `violet` | chama (`ApoiadorSealIcon`)                                                  |

## Onde aparece

- `PlanSeal holder` (`components/plan-seal.tsx`): só o símbolo, na cor do selo (estilo inline de `memberColorCss`), da altura do texto (`size-[1.05em]`), `role="img"` com o nome acessível e o mesmo nome no `title`; `data-seal` = o `kind`. Nada para Grátis.
- `UserHandle username seal` (`components/user-handle.tsx`): o `@username` com o símbolo colado à direita, na mesma linha. Todo @ mostrado como identificação passa por ele: cartão do membro (`member-card-popover.tsx`), prévia "Como a galera te vê", a linha "Nome de usuário" do Perfil, o menu da conta (linha nova com o @ acima do e-mail) e a linha do backoffice. O @ dentro de uma frase (avisos, títulos de diálogo, "Você está conectado como @…") fica em texto.
- Onde a tela não mostra o @, o símbolo vai colado ao nome: as linhas de "Na mesa" (`NickLine`), "Participantes" do detalhe da mesa (o `campaignMemberDto` não tem @) e o título de "Seu plano" (o `PlanSection` recebe `account` = o perfil, para `admin`/`lorkariumOwner`).
- A coluna "Plano" do backoffice escreve o plano gravado em palavras ("Lenda", "Apoiador"); o selo único foi para o lado do @.
- A coroa "Dono"/"Mestre" da mesa (`master-row.tsx`) é outra coisa (o dono da campanha) e não mudou.
- Provado em `client/test/lib/plan-seal.spec.ts` (a precedência inteira), `components/plan-seal.spec.tsx`, `components/plan-seal-icon-map.spec.tsx` (todo ícone, traço e grade), `components/user-handle.spec.tsx` e nos specs das telas.

## Armadilhas

- O ícone do Dono não é o `packages/brand/logo-mark.svg`: os cristais laterais estão afastados do central e o traço é 7,5 em 120, porque na logo original eles grudam no tamanho do selo (~13 px). Não troque pelo arquivo da marca.
