---
description: Separa as mudanças em commits atômicos com mensagens semânticas e assinados (DCO); cria branch se estiver na main; preenche o título e o corpo do PR pelo modelo do repositório; nunca faz push.
argument-hint: [contexto opcional sobre as mudanças]
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git switch:*), Bash(git checkout:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git add:*), Bash(git restore:*), Bash(git commit:*), Bash(git rev-parse:*), Bash(gh pr view:*), Bash(gh pr list:*), Read, Write, Grep, Glob, AskUserQuestion
---

# /commit — Commits atômicos com padrão semântico

Organize as mudanças atuais do repositório em commits atômicos, seguindo as regras abaixo à risca.

## Regras invioláveis

1. **NUNCA execute `git push`** — em nenhuma variação (`push`, `push -u`, `push --force`, etc.). O push é sempre decisão manual do usuário. Repare que `git push` não está na lista de comandos permitidos deste comando: isso é intencional.
2. **Se estiver na `main`/`master`/`desenvolvimento`, SEMPRE crie uma branch nova antes de qualquer commit.** Nunca commite direto na main ou branch de desenvolvimento — nem o primeiro commit do repositório.
3. **Se já estiver em outra branch, permaneça nela.** Não crie outra branch, não faça checkout/switch para trocar.
4. **Arquivo sensível nunca entra em commit sem confirmação explícita do usuário.**
5. **Nunca use `git add .`, `git add -A` ou `git commit -a`.** Adicione arquivos explicitamente, grupo por grupo.
6. **Todo commit sai com `git commit -s`** (DCO, ver `CONTRIBUTING.md`): a linha `Signed-off-by` é a do autor do git, nunca de agente — isso não é co-autoria.
7. **Nunca marque item do checklist do PR sem prova.** `[x]` só para o que foi conferido nesta conversa (comando rodado e verde, arquivo lido); o resto fica `[ ]` com o motivo ao lado.

## Passo a passo

### 1. Levantar o estado

```bash
git branch --show-current
git status
git diff HEAD          # tudo que mudou (staged + unstaged); sem commit ainda, use git status + leitura dos arquivos
git log --oneline -10  # estilo recente de mensagens do repo
```

Se não houver nenhuma mudança para commitar, informe e pare.

### 2. Criar branch (apenas se estiver na main/master)

Derive o nome do conteúdo das mudanças, em kebab-case, com prefixo padrão de mercado:

| Prefixo     | Quando usar                              |
| ----------- | ---------------------------------------- |
| `feature/`  | nova funcionalidade                      |
| `fix/`      | correção de bug                          |
| `hotfix/`   | correção urgente de produção             |
| `refactor/` | refatoração sem mudança de comportamento |
| `chore/`    | manutenção, dependências, configs        |
| `docs/`     | apenas documentação                      |

Exemplos: `feature/movimentacao-de-tokens-em-tempo-real`, `fix/reconexao-perde-versao-do-snapshot`, `refactor/ordem-de-turno-no-game-core`, `chore/fundacao-do-monorepo`.

Repositório sem nenhum commit ainda: `git switch -c <branch>` funciona do mesmo jeito (renomeia a branch que ainda não nasceu).

### 3. Barreira de arquivos sensíveis

Antes de qualquer `git add`, verifique se as mudanças incluem arquivos que não deveriam ser versionados:

- `.env` e variantes (`.env.local`, `.env.production`, ...) — `server/.env.example` é versionado de propósito
- chaves e certificados (`*.pem`, `*.key`, `id_rsa*`, keystores)
- credenciais e segredos (`credentials.json`, `secrets.*`, tokens/senhas hardcoded em configs)
- dumps de banco e artefatos gerados (`*.sql` de dump, `node_modules/`, `dist/`, `coverage/`)

Se encontrar algum: **avise o usuário via AskUserQuestion e NÃO adicione sem confirmação explícita.** Os demais commits seguem normalmente sem esses arquivos. Se não puder perguntar, deixe o arquivo de fora e liste-o no resumo final.

### 4. Separar em commits atômicos

- Um commit = um propósito. Agrupe por unidade lógica, não por conveniência.
- Nunca misture assuntos diferentes no mesmo commit (feature + formatação, refactor + fix, código + docs não relacionados).
- Prefira commits pequenos: se der para dividir de forma coerente, divida.
- Para cada grupo: `git add <arquivos específicos>` → commit → próximo grupo.
- Ordem natural: dependências primeiro (o VO do game-core e o DTO do contracts vêm antes ou junto da fatia do server que os usa — nunca um commit que deixa o build quebrado).

### 5. Mensagem no padrão de commits semânticos

Formato: `tipo(escopo): descrição` — minúsculas, sem ponto final, primeira linha com no máximo 72 caracteres, em pt-BR. Escopo = o workspace ou a área (`server`, `client`, `game-core`, `contracts`, `tokens`, `combat`, `infra`, `claude`).

Tipos: `feat`, `fix`, `hotfix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`, `build`, `ci`.

Corpo opcional: use quando o motivo da mudança não for óbvio pela descrição.

**Sem autoria de agente na mensagem** — nada de `Co-Authored-By`, "Generated with Claude Code" ou emojis de assinatura. O `Signed-off-by` do `-s` é o do usuário e fica.

Exemplos:

```
feat(tokens): move token por evento com versão do estado
fix(sessions): reconexão descarta evento mais velho que o snapshot
refactor(game-core): ordem de turno sai do server para o game-core
test(combat): cobre avanço de rodada no último da iniciativa
docs(context): atualiza contexto do módulo de combate
chore(claude): porta comandos e skills do trakio
```

Commit: `git commit -s -m "<título>"` (com `-m "<corpo>"` extra quando houver corpo).

### 6. Conferir o checklist

O PR cobre a branch inteira, não só os commits de agora. Levante o que entra nele:

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
git log main..HEAD --format='%h %(trailers:key=Signed-off-by,valueonly,separator=%x2C)'
```

Prove cada item do `.github/pull_request_template.md` (leia o modelo: se ganhou item novo, ele entra também):

| Item                        | Como provar                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| teste novo / regressão      | Cada `src/` novo ou alterado no diff tem spec correspondente em `<workspace>/test/` no mesmo diff; fix tem spec de regressão. Faltou: `[ ]` listando os arquivos sem spec.                            |
| `docs/context/` atualizado  | Se o diff mexe em contrato, evento, DTO, PO/migração, env ou estrutura, tem de haver `docs/context/` no diff. Nada disso mudou: `[x]` com "(não se aplica: …)".                                       |
| commits convencionais + DCO | Todos os títulos de `main..HEAD` no formato `tipo(escopo): …` e todos com `Signed-off-by`. Commit antigo sem assinatura: `[ ]` com os hashes e a dica `git rebase --signoff main` (o usuário decide). |

### 7. Preencher o PR

Grave em `.git/PR_BODY.md` (dentro do `.git`, nunca versionado) o corpo seguindo o modelo, sem os comentários `<!-- -->`:

- **O que muda**: 2 a 5 frases sobre o que o PR entrega e por quê, para quem não leu a conversa; depois uma lista curta por área (server, client, contracts, game-core, docs, e2e) do que mudou. Cite a issue (`Closes #N`) se o usuário ou a branch a mencionar — nunca invente número. Sem nome de plano de `docs/plans/`.
- **Como testar**: passos concretos para ver funcionando (`pnpm dev`, conta do `pnpm db:seed-dev`, onde clicar) e os specs que provam, por caminho. Migração nova, env nova ou passo de deploy: avise aqui.
- **Checklist**: os itens do modelo, marcados pela etapa 6.

Título do PR: `tipo(escopo): descrição` em pt-BR, ≤ 72 caracteres, resumindo a branch (não o nome da branch nem o último commit).

Se já existir PR da branch (`gh pr list --head <branch>`), leia o corpo atual com `gh pr view` e preserve o que o usuário escreveu à mão.

### 8. Finalizar

Mostre o `git log --oneline` dos commits criados, liste qualquer arquivo sensível deixado de fora, mostre o título e o corpo do PR e entregue os comandos para o usuário rodar (não rode):

```bash
git push -u origin <branch>
gh pr create --base main --title "<título>" --body-file .git/PR_BODY.md
# ou, com PR já aberto:
gh pr edit --body-file .git/PR_BODY.md
```

Termine aí: **o push e a abertura do PR são responsabilidade do usuário.**

## Contexto adicional do usuário

$ARGUMENTS
