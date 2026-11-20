# Client · Cadastro público

Hub: [`../client.md`](../client.md). As páginas de quem ainda não tem conta: pedir o cadastro pelo e-mail e criar a conta pelo link. O serviço (`SignUpApi`) e o link do convite do admin estão em [`account-links.md`](account-links.md); o widget do Turnstile em [`estrutura.md`](estrutura.md).

## Rotas (`src/features/sign-up/sign-up-routes.tsx`)

- `/sign-up` e `/sign-up/confirm` — filhas do root, **fora do shell**, guarda `anyone`, moldura `AuthFrame`, montadas pelo `anyonePage(deps, path, name, parts)` do `router.tsx` (o mesmo de `/invite`, `/reset-password` e das páginas de e-mail da conta).
- `/sign-up`: `loader` `signUpSettingsLoader(deps)` (o `SignUpResult` do `GET /api/sign-up/settings`, falha incluída) e `action` `signUpAction(deps)` (`sign-up-action.ts`: JSON validado por `z.discriminatedUnion` sobre o `signUpRequestDto`; devolve `{ intent, sent: true }` ou `{ intent, failure }`).
- `/sign-up/confirm`: `action` `accountLinksAction(deps)` (o `inspect` e o `accept` do convite, que valem para as duas origens).
- `/login` também usa o `signUpSettingsLoader` (`features/auth/login-route.tsx`): "Criar conta" só aparece com `registrationOpen`; ajustes que não chegam escondem o link.

## `/sign-up` (`sign-up-page.tsx`)

- "Crie sua conta" + "Comece pelo seu e-mail: mandamos um link para você escolher seu @ e sua senha."
- Campo "E-mail" (`type=email`), validado pelo `signUpRequestDto.shape.email` (aparado e em minúsculas): fora do formato → "Informe um e-mail, como voce@exemplo.com." no campo, focado, nada enviado.
- O widget do Turnstile com a `humanCheckSiteKey`; "Criar conta" fica desabilitado até ele dar o token ("Enviando…" durante o pedido). **Sem site key** (`humanCheckSiteKey: null`, o server de dev sem chave), o widget não aparece, o botão não espera e o pedido leva `humanCheckToken: 'skipped'`: o `SkippedHumanCheck` do server de dev aceita qualquer token, e o de produção nunca sobe sem chave.
- O token vale uma vez na Cloudflare: todo envio pede um novo (`useHumanCheck().renew` remonta o widget), e o botão volta a esperar se o pedido for recusado.
- Enviado: o formulário vira "Confira seu e-mail" + "Mandamos um e-mail para ana@exemplo.com. O link dele vale 24 horas." (`role="status"`), **igual para qualquer endereço** (o server responde o mesmo 202 com ou sem conta).
- `registrationOpen: false` (nos ajustes) ou `registration_closed` (no pedido): "O cadastro está fechado no momento.", sem formulário.
- Recusas no `Alert` (`sign-up-messages.ts`, `signUpFailureMessage`): `human_check_failed` → "A verificação não passou. Faça de novo e envie."; `rate_limited` → "Muitos pedidos. Tente de novo em N min." (segundos arredondados para cima, no mínimo 1); `invalid` → "Confira o campo e tente de novo."; `offline`/`unexpected` → as frases comuns. Ajustes que não chegam: o `Alert` no lugar do formulário.
- Aberta logada: "Você já está conectado como @caio. Para criar outra conta, saia primeiro." + "Sair e continuar" (`SignedOutFirst`, ver [`account-links.md`](account-links.md)).

## `/sign-up/confirm` (`sign-up-confirm-page.tsx`)

- O link do e-mail é `/sign-up/confirm#token=…`; o token sai do fragmento (`useFragmentToken`) e o `inspect` roda uma vez ao montar.
- "Crie sua conta" + "Cadastro de ana@exemplo.com"; enquanto confere, "Conferindo o link…". O formulário é o `InviteAcceptForm` do `/invite` (o @ sugerido, a senha duas vezes, "Manter conectado", a caixa "Tenho 18 anos ou mais e li e aceito…", "Criar minha conta"); aceito, a conta nasce logada e vai para `/`.
- Link morto (no `inspect` ou no aceite) ou sem token: "Esse link venceu ou já foi usado." + "Pedir outro" (→ `/sign-up`).
- Aberta logada: o mesmo aviso do `/sign-up`.

## Peças compartilhadas

- `public-request-form.tsx` — `PublicRequestForm`: o formulário de um campo das páginas públicas (campo, widget, `Alert`, botão que espera o token, aviso de enviado por `sent(valor)`), sobre o `signUpAction`.
- `use-human-check.tsx` — `useHumanCheck(siteKey)`: `{ token, widget, renew }`; sem site key, `token = 'skipped'` e `widget = null`.

## Testes

- `test/features/sign-up/{sign-up-page,sign-up-confirm-page}.spec.tsx` (pelo router, com o `TurnstileScriptFake` já carregado), `sign-up-messages.spec.ts` e `test/features/auth/login-page.spec.tsx` ("Criar conta" com o cadastro aberto, fechado e sem ajustes). Fake: `SignUpApiFake` ([`account-links.md`](account-links.md)).
