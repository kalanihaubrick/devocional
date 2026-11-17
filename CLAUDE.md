# Devocional — contexto para o Claude

PWA gamificado para o hábito de devocional e leitura: timer com meta diária por atividade, XP, níveis, sequência, calendário e conquistas. Interface e textos em **português (pt-BR)**.

- **Produção:** https://kalanihaubrick.github.io/devocional/ (GitHub Pages, branch `main`, raiz). Cada push publica uma versão nova.
- **Repositório:** `kalanihaubrick/devocional` (público).
- **Backend:** Supabase, projeto `dwwugdicatihfgsrttzg`. A URL e a chave *publishable* em `config.js` são públicas por design.

## Restrições importantes
- **Alvo principal: iPhone 7 Plus com iOS 15.8 (Safari, instalado como PWA).**
  - Use JavaScript puro, sem framework e sem etapa de build.
  - Evite APIs e CSS novos demais, como `structuredClone`, CSS nesting, `:has`, o atributo `popover` e web push. iOS 15 não tem notificação push nem Wake Lock.
- **Timer:** o tempo é calculado por timestamps (`Date.now()`), nunca contando ticks, porque o iOS suspende o JavaScript com a tela bloqueada. A sessão ativa fica salva em `Store.state.active`.
- **Fonte de verdade:** XP, nível, sequência e conquistas são **sempre recalculados a partir das sessões** (`game.js` → `Game.compute`). Não guarde totais derivados.
- **Offline-first:** grava primeiro no `localStorage` (`store.js`). Os registros alterados entram em `dirty` e `sync.js` faz upsert por UUID. Na junção, vence o `updatedAt` mais recente. Sessões nunca são apagadas de verdade: usam `deleted: true`.
- **Ao publicar mudanças nos arquivos do app, aumente `CACHE` em `sw.js`** (hoje `devocional-v2`).

## Login (sem senha: e-mail + TOTP)
- **Primeiro acesso e recuperação:** código por e-mail (`signInWithOtp` + `verifyOtp type:'email'`). Depois vem o cadastro do autenticador pela função `totp-enroll`.
- **Login normal:** a função `totp-login` valida o código TOTP e devolve o `hashed_token` de um magic link gerado pelo servidor. O app troca o token por uma sessão com `verifyOtp({token_hash, type:'magiclink'})`.
- **Proteções:** no máximo 5 falhas a cada 15 min por e-mail (`login_attempts`), e um código já usado não vale de novo (`last_used_step`).
- `totp_secrets` e `login_attempts` não têm nenhum acesso pelo cliente (RLS sem políticas, mais `revoke`). Só as funções acessam, com a service role.
- **Edge Functions** (`supabase/functions/*/index.ts`):
  - Cada uma precisa ser **arquivo único**, sem import local, porque são publicadas colando no editor do painel.
  - **Verify JWT desligado** nas duas.
  - Alterar o código no repositório **não** publica a função: o usuário precisa colar a nova versão no painel.

## Supabase: configuração atual
- O esquema está em `supabase/schema.sql` e é idempotente: pode rodar de novo.
- **E-mail:** SMTP do Gmail com senha de app. No plano grátis, desde junho de 2026, os templates só são editáveis com SMTP próprio. Os templates *Magic Link* e *Confirm signup* mostram `{{ .Token }}`.
- **Cadastro aberto de propósito:** o usuário deixa amigos usarem o app. Não restrinja sem ele pedir.

## Segurança
- **Nunca** coloque no repositório: a secret key (`sb_secret_...`), a service_role, a senha do banco ou a senha de app do Gmail.
- A chave *publishable* é pública. Quem protege os dados é o RLS (`user_id = auth.uid()`).

## Arquivos
| Arquivo | Papel |
|---|---|
| `index.html`, `styles.css` | Telas (Hoje, Timer, Histórico, Conquistas, Ajustes, Auth), tema claro e escuro |
| `app.js` | Interface, timer, modais, histórico, ajustes, backup |
| `game.js` | Regras: 1 XP/min, +20 por meta batida, +10 por todas as metas, bônus de sequência de +5% a cada 7 dias (até +50%); nível `100 × n^1.5`; conquistas |
| `store.js` | Estado local (`localStorage` chave `devocional.v1`), junção e backup JSON |
| `sync.js` | Sincronização com o Supabase |
| `auth.js` | Telas e fluxo de login |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `README.md` | Guia para usuários finais (fork, Pages, Supabase, problemas comuns) |

## Testar
- **Local:** `python -m http.server 5173` (há um `.claude/launch.json`) e abrir em 414×736.
- **Modo local, sem login:** deixar `config.js` com valores vazios, só para o teste, e não commitar.
- **Commits:** em português, curtos.
