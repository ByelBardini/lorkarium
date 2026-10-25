# Legal (Termos de uso e Política de privacidade no app)

Como o app abre e registra os textos legais. Os textos em si (Markdown, rascunho, LGPD) moram na landing: [`site.md`](site.md), Páginas legais. Decisões de 2026-10-25 com o responsável: o app linka a própria origem e o server redireciona para a landing; uma versão (data) para o par Termos + Privacidade; só as contas novas aceitam (as que já existiam ficam com o aceite nulo, sem tela de re-aceite no login).

## Server (`server/src/modules/legal/`)

- `legal.mapper.ts` — `landingPageUrlOf(sitePublicUrl, document)`: `terms` → `/termos/`, `privacy` → `/privacidade/` (os caminhos das páginas da landing, que os textos citam e não mudam).
- `legal.routes.ts` — `GET /api/legal/terms` e `GET /api/legal/privacy` **(públicas)**: 302 para `${SITE_PUBLIC_URL}/termos/` e `/privacidade/`; outro documento é o 404 do Fastify. Sem sessão de propósito: o login e o convite linkam antes de existir uma.
- `legal.plugin.ts` — `legalPlugin`, registrado no `buildApp` com `env.sitePublicUrl`.
- Env `SITE_PUBLIC_URL` ([`server.md`](server.md), Env; [`deploy.md`](deploy.md)): padrão `http://localhost:4321` (`pnpm site:dev`), **obrigatória em produção**; o smoke da imagem no CI passa `http://localhost:4321`.
- Por que o redirect: o client não lê `VITE_*` em produção (uma imagem para todo ambiente). No desktop, `target=_blank` para a mesma origem cai no `OpenExternal` ([`desktop.md`](desktop.md)): o navegador padrão abre o `/api/legal/*` e segue o 302.

## Aceite no convite (clickwrap)

- `POST /api/invitations/accept` exige `acceptedTerms: true` ([`contracts.md`](contracts.md)); o server grava `users.terms_accepted_at` (o relógio do server) e `users.terms_version` = `LEGAL_DOCUMENTS_VERSION`, pelo `termsAcceptanceAt` de `account-links.mapper.ts` ([`account-links.md`](account-links.md)). A versão é a que está em vigor no server, nunca uma que o client diga.
- Migração `0054_terms_acceptance`: as duas colunas nulas e o `CHECK users_terms_acceptance_pair` (as duas juntas ou nenhuma).
- Sem aceite registrado: as contas do seed (admin, Bia, Caio) e os convites aceitos antes da `0054`.
- **Mudou o texto** de `site/src/content/legal/termos.md` ou `privacidade.md`: atualize o `updatedAt` e o `LEGAL_DOCUMENTS_VERSION` (`packages/contracts/src/legal/legal-documents.dto.ts`) juntos. As contas novas passam a gravar a versão nova; as antigas guardam a delas (pedir de novo seria uma tela própria, fora do escopo de 2026-10-25).

## Client

- `src/lib/legal-documents.ts` — `LEGAL_DOCUMENT_TITLES` ("Termos de uso", "Política de privacidade") e `legalDocumentHref(document)` → `/api/legal/<documento>`.
- `src/components/legal-document-link.tsx` — `LegalDocumentLink`: `target="_blank"`, `rel="noopener noreferrer"`, o título como texto quando não há children; as outras props chegam ao `<a>` (o `asChild` do item do menu).
- Onde aparece: a caixa do `/invite` ([`client/account-links.md`](client/account-links.md)), o rodapé do `AuthFrame` (`LegalLinks`, [`auth.md`](auth.md), Client) e o menu do usuário ([`client/home.md`](client/home.md)).

## Testes

- Unit: `server/test/modules/legal/legal.mapper.spec.ts`, `server/test/config/env.spec.ts` (`SITE_PUBLIC_URL`), `server/test/modules/account-links/{account-links.mapper,invitations.service}.spec.ts` (o aceite gravado) e `packages/contracts/test/account-links/account-links.dto.spec.ts` (`acceptedTerms` ausente ou `false` recusado).
- Integração: `server/test/integration/legal.spec.ts` (302 dos dois sem sessão, 404 de outro) e `account-links.spec.ts` (o aceite grava data e versão; sem ele, 400 sem conta e o convite segue valendo).
- Client: `test/lib/legal-documents.spec.ts`, `test/components/legal-document-link.spec.tsx`, `test/features/auth/auth-frame.spec.tsx`, `test/app/shell/user-menu.spec.tsx` e `test/features/account-links/invite-accept-page.spec.tsx` (links da caixa, caixa desmarcada não envia e recebe o foco, o pedido leva `acceptedTerms: true`). E2E: `e2e/test/backoffice.spec.ts` marca a caixa antes de "Criar minha conta".
