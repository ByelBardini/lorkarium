# Documentos — testes

Hub: [../documents.md](../documents.md).

## Provas por camada

- Contracts: conteúdo fechado, budgets UTF-8/nós/texto/profundidade/imagens, estrutura de tabela/lista, links e fontes, comandos estritos, patches vazios, donos repetidos.
- Server unit: `document-access.bo`, mapper, service, imagens e política de bytes. Diário de fakes prova rollback sem publicação e confirmação após commit; replay reautoriza, conflito preserva conteúdo.
- Integração: `documents.spec.ts`, `document-writes.spec.ts`, `document-images.spec.ts`, `documents-dao.spec.ts`: criação/restart, posse múltipla e revogação, concorrência, isolamento e FKs compostas, cascata, pasta/ancestrais, imagens preparadas/confirmadas e biblioteca independente. Abas: `document-tabs-dao.spec.ts` e `document-tabs-migration.spec.ts` (tabela, único adiável, migração do corpo para "Geral"), `document-tabs.spec.ts` (comandos, versão por aba, aba oculta, limite e última aba) e `document-tab-images.spec.ts` (bytes por aba visível); o que cada um prova em [abas.md](abas.md) e [imagens.md](imagens.md).
- Client: editor real, adaptador e extensões; API, debounce/serialização/conflito/timeout, painel/leitor/revogação/saída pendente; compartilhamento, picker, identidade e filtros mistos.
- E2E: `library-documents.spec.ts`, grupo `library`: formatação real da seleção/tabela e F5; dois donos e revogação; prévia, alternância entre abas e edição em janela separada; gravação concorrente com rascunho preservado. Screenshot do primeiro cenário guarda toolbar e tabela. `library-document-tabs.spec.ts`, mesmo grupo: "Itens" e "Segredos" com texto próprio depois do F5; "Segredos" só mestres com imagem — a Bia (dona) não a vê na faixa, no detalhe, pelo id (404) nem os bytes (404), reordena "Itens" para a esquerda e a Ana vê Itens, Segredos, Geral; o Caio lê o documento público sem "Nova aba" nem menu; a janela destacada abre na aba ativa e a troca feita nela vale de volta na sala.

## Execução

Achados revisados dos drivers: DAO e rotas são provados nas integrações indicadas acima; classes de erro são exercidas por BO/service/borda. A toolbar é observada pelo editor real e pelo e2e de seleção, sem spec que replique internals Tiptap. O aviso de adaptador em `DocumentAssetReadPolicy` é falso positivo: é uma política de autorização do módulo com DAOs injetados, no mesmo padrão de `LibraryImageReadPolicy`; composição de I/O fica no build-app.

Integrações usam Postgres e S3 descartáveis pela receita de `.claude/skills/testar/SKILL.md` (5434/8334 é só o padrão dela: com outra sessão no mesmo checkout, subir containers próprios em portas únicas e exportar `DATABASE_URL`/`S3_ENDPOINT` delas). Nunca o banco de desenvolvimento. Executar arquivos que truncam o mesmo banco em sequência.

E2E só ao fim da implementação, fragmentos em processos sequenciais:

```powershell
pnpm test:e2e --project=library library-documents.spec.ts --grep 'rich document' --workers=1
pnpm test:e2e --project=library library-documents.spec.ts --grep 'multiple document owners' --workers=1
pnpm test:e2e --project=library library-documents.spec.ts --grep 'document popup opens' --workers=1
pnpm test:e2e --project=library library-documents.spec.ts --grep 'concurrent remote' --workers=1
pnpm test:e2e --project=library library-document-tabs.spec.ts --grep 'own text across a reload' --workers=1
pnpm test:e2e --project=library library-document-tabs.spec.ts --grep 'masters-only tab' --workers=1
pnpm test:e2e --project=library library-document-tabs.spec.ts --grep 'detached document window' --workers=1
pnpm test:e2e --project=library library.spec.ts --workers=1
pnpm test:e2e --project=library library-images.spec.ts --workers=1
pnpm test:e2e --project=library character.spec.ts --workers=1
```

Cada boot limpa exclusivamente banco `_e2e` e bucket `-e2e` isolados. Chromium não prova o menu/cópia/colagem do WebView2 real; essa conferência pertence à casca Windows.
