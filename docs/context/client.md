# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, moldura do app em `src/app/shell/`, tabuleiro (futuro) em `src/renderer/`.

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda a estrutura, as rotas e os testes.

| Assunto                                                                      | Arquivo                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| Tokens de cor, tipografia, forma, componentes base e regras anti-template    | [`design-system.md`](client/design-system.md) |
| Shell (trilho, menu, gaveta), home, diálogos de mesa, detalhe e tela da mesa | [`home.md`](client/home.md)                   |

## Estrutura

- `src/main.tsx` — monta `createBrowserRouter(buildRoutes(deps))` com os adaptadores reais (`HttpAuthApi`, `HttpCampaignsApi`, `NavigatorClipboard`, `createRailStore` sobre o `localStorage`, `new Date()`, `Math.random`)
- `src/app/router.tsx` — `buildRoutes(deps)`: rotas do modo data do React Router 8 (abaixo); `AppDependencies` = `{ authApi, campaignsApi, clipboard, sessionStore, railStore, now, random }`, para o teste injetar fakes
- `src/app/route-access.ts` — `decideAccess(session, access, url)`: decisão pura `allow` | `redirect` por `RouteAccess` (`public-only`, `signed-in`, `admin`); `loginPathFor(url)` → `/login?next=…`
- `src/app/splash-screen.tsx` (`role="status"`, "Carregando…") e `src/app/route-error-screen.tsx`
- `src/app/shell/` — `AppShell`, trilho, menu do usuário, gaveta e `api-loader.ts` (ver [`client/home.md`](client/home.md))
- `src/features/auth/` — tela de login (ver [`auth.md`](auth.md)); `src/features/home/` e `src/features/campaigns/` — ver [`client/home.md`](client/home.md); `src/features/admin/admin-page.tsx` — placeholder
- `src/index.css` — tokens do tema (único, escuro) e as fontes self-host (`@fontsource-variable`)
- `src/components/ui/` — componentes shadcn (`button`, `input`, `label`, `checkbox`, `alert`, `textarea`, `radio-group`, `dialog`, `sheet`, `dropdown-menu`, `tooltip`), já ajustados ao design system
- `src/components/brand-mark.tsx` — `BrandMark` (logo; variantes `full`, `compact` e `icon`, só o cristal, sempre anunciado como "LORKARIUM")
- `src/components/form-field.tsx` — `FormField` (rótulo + controle + erro `<id>-error` ou dica); `password-field.tsx` — `PasswordField` (mostrar/ocultar, `autoComplete` e `autoFocus` opcionais)
- `src/components/campaign-cover.tsx` (capa SVG `aria-hidden`) e `copy-code-button.tsx` ("Copiar código" + `role="status"`)
- `src/lib/utils.ts` — `cn`
- `src/lib/safe-redirect.ts` — `safeRedirectTarget(next)`: só caminho interno; `//x`, `/\x`, URL absoluta, `javascript:`, vazio e `/login` viram `/`
- `src/lib/greeting.ts` — `GREETINGS` (as 10 saudações da home) e `greetingFor(nome, sorteio ∈ [0, 1))` com o primeiro nome; sorteio fora do intervalo → `RangeError`
- `src/lib/overline-date.ts` — `formatOverlineDate(data)` → "Quarta, 14 de outubro" (sem "-feira", hora local)
- `src/lib/campaign-cover.ts` — `coverFor(id)` → `{ variant: 0..2, tone: 1..4 }` estável por id (hash `×31`)
- `src/lib/campaign-code.ts` — `formatCampaignCode('VHRN7K2Q')` → `'VHRN-7K2Q'` e `maskCampaignCode(digitado)` (máscara do campo: só letras e dígitos, caixa alta, até 8, hífen depois do 4º; quem valida continua sendo o DTO)
- `src/lib/campaign-list.ts` — `filterCampaigns(mesas, busca)` (nome ou sistema, sem acento nem caixa) e `continueCandidate(mesas)` (a de `lastEnteredAt` mais recente, ou `null`)
- `src/lib/campaign-meta.ts` — `campaignMeta(mesa)` ("Tormenta20 · mestre: Bia · 4 participantes"; o mestre só aparece para quem joga), `memberCountLabel(n)`, `ROLE_LABEL`
- `src/services/http-transport.ts` — `HttpTransport` (interface), `FetchHttpTransport` (base `/api`, JSON, `credentials: 'same-origin'`), `NetworkUnavailableError`; resposta com `body` JSON, `null` se vazia, `undefined` se não-JSON
- `src/services/api-call.ts` — o comum a todo serviço: `callApi(transport, método, caminho, corpo?)` → `ok` (status < 300) | `refused` (com a resposta, para o serviço nomear o `kind`) | `offline`; `parseOk(dto, corpo, pick)` (corpo fora do DTO → `unexpected`); `retryAfterOf(resposta)` (`Retry-After`, senão `retryAfterSeconds` do corpo, senão 60); `errorCodeOf(resposta)`
- `src/services/auth-api.ts` — `AuthApi` / `HttpAuthApi`: devolve `AuthResult` (nunca lança); falhas `invalid_credentials` (401), `rate_limited` (429), `offline`, `unexpected`
- `src/services/campaigns-api.ts` — `CampaignsApi` / `HttpCampaignsApi`: `list`, `create`, `detail`, `join`, `enter`, cada um devolvendo `CampaignsResult<T>`; falhas (`CampaignsFailure`): `unauthenticated` (401), `not_found` (404), `invalid` (400), `password_required` / `password_invalid` (403 pelo `code`), `rate_limited` (429), `offline`, `unexpected`
- `src/services/clipboard.ts` — `Clipboard` (interface) e `NavigatorClipboard` (`copy(texto)` → `false` quando o navegador recusa)
- `src/stores/rail-store.ts` — `createRailStore(storage)` (Zustand vanilla), `useRail(store)`; `rail` = `expanded` (padrão) | `collapsed`, gravado em `localStorage` (`lorkarium.rail`); storage que lança cai na memória
- `src/stores/session-store.ts` — `createSessionStore()` (Zustand vanilla), singleton `sessionStore`, hook `useSession(store)`; estado `unknown` → `authenticated { user }` | `anonymous`

## Rotas

| Caminho                        | Acesso        | Tela                                                                                        |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------- |
| `/login`                       | `public-only` | `LoginPage`; logado vai para o `next` seguro ou `/`                                         |
| `/`                            | `signed-in`   | shell + `HomePage` (`loader` da lista, `action` de criar/entrar por código)                 |
| `/campaigns/:campaignId`       | `signed-in`   | a home com o modal de detalhes por cima (`loader` do detalhe, `action` de "Entrar na mesa") |
| `/campaigns/:campaignId/table` | `signed-in`   | shell + tela provisória da mesa (`loader` do detalhe)                                       |
| `/admin`                       | `admin`       | `AdminPage`, carregada por `lazy` (fora do shell)                                           |
| `*`                            | —             | redireciona para `/`                                                                        |

- O root tem `middleware` que faz **um** `GET /api/auth/me` enquanto a sessão está `unknown` e o `HydrateFallback` (splash) cobre essa espera. Cada rota tem um `middleware` de guarda que chama `decideAccess` e lança `redirect`; as rotas logadas vivem sob a rota de layout `shell` (sem `path`, guarda `signed-in`).
- Árvore: `root` → `login` · `admin` · `shell` → [`home` (`path: '/'`) → [índice, `campaigns/:campaignId`], `campaigns/:campaignId/table`] · `*`.
- Visitante em rota protegida vai para `/login?next=<caminho+query codificados>`; depois do login, `safeRedirectTarget(next)`. `loader`/`action` que recebe `unauthenticated` faz o mesmo (`redirectIfSignedOut`).
- A guarda do client só evita mostrar a tela errada; quem recusa é o server.

## Regras de arquitetura

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo (raio de 4px, sem sombra nem blur, rótulos em pt-BR).
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor, a tela só traduz o `kind` em mensagem.
- Dados de tela pelo modo data: lista e detalhe por `loader`, mutação por `action` (o router revalida sozinho); envio sem navegação por `useFetcher`. O Zustand fica para sessão, trilho e (depois) tempo real.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` (`client/vite.config.ts`); em produção é a mesma origem. Sem CORS e com cookie first-party.

## Testes

- Vitest do projeto `@lorkarium/client` em `jsdom` (`client/vite.config.ts`, bloco `test`); specs em `client/test/` espelhando `src/` e importando por `@/...`.
- `client/test/setup.ts` carrega o jest-dom e faz `cleanup` depois de cada `it` (sem globals do Vitest, o Testing Library não se limpa sozinho).
- `client/test/jest-dom.d.ts` tipa os matchers do jest-dom no `Matchers<R, T>` do Vitest 5.
- `client/test/support/app-dependencies.ts` — `testDependencies()`: todo o `AppDependencies` em fakes, `now` fixo (`TEST_NOW`, quarta 14/10/2026) e `random` = 0 ("E aí, {nome}.").
- `client/test/support/http-transport-fake.ts` — `HttpTransportFake` (`respondWith(status, body, headers)`, `failWithNetworkDown()`, `requests`).
- `client/test/support/campaigns-api-fake.ts` — `CampaignsApiFake` (`answer(método, resultado)`, `hold(método)`, `callsOf(método)`), mesas `VHARN` (mestre, entrou por último) e `QUELM` (jogador, pública, Tormenta20) e `detailOf(resumo, overrides)`.
- `client/test/support/clipboard-fake.ts` (`ClipboardFake`, `copied`) e `storage-fake.ts` (`StorageFake`, `values`; `new StorageFake(true)` lança como storage bloqueado).
- Tela com `loader`/`action` se prova pelo router inteiro (`createMemoryRouter(buildRoutes(testDependencies()))`); os subcomponentes de diálogo e da home não têm spec próprio, são provados pelo spec do pai.
- Componente se prova pelo que o usuário vê: `getByRole`/`getByLabelText` + `toHaveTextContent`/`toBeDisabled`/`toHaveAttribute`, não classe CSS.

## Armadilhas

- No modo data, o `middleware` do root já mantém a navegação inicial pendente e mostra o `HydrateFallback`; não precisa de `loader` só para isso.
- Playwright: `getByLabel('Senha')` casa por substring e pega também o botão "Mostrar senha"; use `{ exact: true }`.
- O jsdom não tem `ResizeObserver` e o Checkbox do Radix usa um: `client/test/setup.ts` instala o `ResizeObserverStub`.
- `react-hooks/refs` (React Compiler) acusa "Cannot access refs during render" em qualquer leitura de um objeto que **carrega** um ref (`form.submitting` quando `form` tem `emailRef`, ou um `binding` com a função de ref). Desestruture o retorno do hook, ou foque por id (`document.getElementById`) em vez de guardar o ref.
- No `jsdom`, `await expect(p).rejects.toThrow(/regex/)` sobre subclasse de `Error` lê a mensagem como `''`. Use `rejects.toBeInstanceOf(X)` + `rejects.toMatchObject({ message: expect.stringContaining(...) })`.
- `@custom-variant dark (&)` no `index.css`: o app só tem tema escuro, então todo `dark:` dos componentes shadcn vale sempre. Não reintroduzir a classe `.dark`.
- Rota com `action` precisa de `path`: o alvo de uma submissão é a última rota que **contribui com path**; numa rota de layout sem `path` (só filhos), o `fetcher.submit` cai fora dela e volta 405 ("did not provide an `action` for route…"). Por isso a `home` tem `path: '/'`.
- Arquivo que exporta fábrica de rota (função) e declara componente no topo dispara `react-refresh/only-export-components`; o componente da rota vai para o arquivo da tela (exportado) ou nasce dentro da fábrica.
- `pnpm exec shadcn add` pergunta se sobrescreve o `button.tsx` (dependência de `dialog`/`sheet`) e, sem resposta, não cria nada: rode `yes n | pnpm exec shadcn add <nome>`.
- `asChild` do Radix (o `Slot` de `TooltipTrigger`, `DropdownMenuItem`, `SheetTrigger`…) junta `className` como texto: um `NavLink` com `className={({ isActive }) => …}` vira o código-fonte da função e perde todas as classes. Dentro de `asChild`, passe string (no trilho, o ativo vem de `useMatch`). Regressão em `client/test/app/shell/app-shell.spec.tsx`.
