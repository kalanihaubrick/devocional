# 📖 Devocional

Um timer gamificado para criar o hábito do devocional e da leitura diária. Ele funciona como um **app no iPhone**, inclusive em aparelhos antigos como o iPhone 7 Plus (iOS 15), instalado pelo Safari como PWA.

- ⏱️ **Timer com meta diária por atividade.** Exemplo: Devocional com meta de 10 min, feito 30 min. Leitura com meta de 10 min, feito 10 min.
- ⭐ **XP e níveis.** Você ganha 1 XP por minuto, mais 20 XP por meta batida, mais 10 XP se bater todas as metas do dia. A sequência dá um bônus de +5% a cada 7 dias, até no máximo +50%.
- 🔥 **Sequência de dias.** O dia conta quando você bate pelo menos uma meta. O app guarda também o seu recorde.
- 📅 **Histórico em calendário,** com o que foi lido e suas anotações.
- 🏅 **Conquistas (medalhas).**
- ☁️ **Conta e sincronização (opcional).** O login não usa senha: é só o e-mail e o código do app autenticador. O progresso aparece em qualquer aparelho em que você entrar.
- 📴 **Funciona offline.** Tudo é salvo primeiro no aparelho e sincroniza quando houver internet.

---

## 1. Testar no computador

O app funciona sem configurar nada. Nesse caso ele roda em **modo local**: sem login, com os dados só naquele aparelho.

```bash
npx serve .
```

Abra o endereço que aparecer (normalmente http://localhost:3000).

## 2. Publicar no GitHub Pages

1. Envie os arquivos para o repositório (`git push`).
2. No GitHub, vá em **Settings → Pages → Build and deployment**. Em *Source*, escolha **Deploy from a branch**, e depois **main** e **/ (root)**. Clique em **Save**.
3. Em 1 a 2 minutos o app estará em `https://kalanihaubrick.github.io/devocional/`.

## 3. Instalar no iPhone

1. Abra o link no **Safari**. Precisa ser o Safari, porque o Chrome do iPhone não instala PWA no iOS 15.
2. Toque em **Compartilhar** (o quadrado com a seta para cima) e depois em **Adicionar à Tela de Início**.
3. Abra pelo ícone. Ele roda em tela cheia, como um app.

> Dica: em *Ajustes → Tela e Brilho → Bloqueio Automático*, aumente o tempo. Se a tela apagar, o timer continua contando certo, porque o tempo é calculado pelo relógio. Mas o som de "meta batida" só toca com o app aberto.

---

## 4. Ativar a conta e a sincronização (Supabase, grátis)

Sem esta etapa, os dados ficam só no aparelho. Com ela, você entra com **e-mail e código do autenticador** e o progresso fica salvo na nuvem.

### 4.1 Criar o projeto
1. Crie uma conta em https://supabase.com e um **New project**. Escolha a região mais próxima, por exemplo *South America (São Paulo)*.
2. Abra o **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.

### 4.2 Configurar o envio do código por e-mail
O código por e-mail só é usado no **primeiro acesso** e para **recuperar a conta**.

> Desde junho de 2026, projetos novos no plano grátis **só podem editar os templates de e-mail se usarem um SMTP próprio**. O Gmail serve como SMTP grátis.

**a) Criar uma senha de app no Gmail**
1. Na sua Conta Google, vá em **Segurança** e ative a **Verificação em duas etapas**, se ainda não estiver ativa.
2. Acesse https://myaccount.google.com/apppasswords, crie uma senha com o nome "Supabase" e copie os 16 caracteres.

**b) Ligar o SMTP no Supabase**
Vá em **Authentication → Emails → SMTP Settings**, ative **Enable custom SMTP** e preencha:

| Campo | Valor |
|---|---|
| Sender email | seu endereço do Gmail |
| Sender name | Devocional |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | seu endereço do Gmail |
| Password | a senha de app de 16 caracteres (não é a senha normal do Gmail) |

Salve. A partir daí, os templates passam a ser editáveis.

**c) Editar os templates**
1. Vá em **Authentication → Emails → Templates**.
2. Nos templates **Magic Link** e **Confirm signup**, troque o corpo para mostrar o código:
   ```html
   <h2>Seu código do Devocional</h2>
   <p>Digite este código no app: <b style="font-size:24px">{{ .Token }}</b></p>
   ```
3. Em **Authentication → URL Configuration**, coloque em *Site URL* o endereço do GitHub Pages.

> Com o SMTP próprio, o limite inicial é de 30 e-mails por hora (ajustável em *Rate Limits*). Isso sobra para o primeiro acesso e para recuperações.

### 4.3 Publicar as 2 Edge Functions
Dá para fazer pelo painel ou pelo terminal.

**Pelo painel:** vá em **Edge Functions → Deploy a new function → Via Editor** e crie duas funções:
- `totp-enroll`: cole o conteúdo de `supabase/functions/totp-enroll/index.ts`.
- `totp-login`: cole o conteúdo de `supabase/functions/totp-login/index.ts`.

Cada função é um arquivo único: é só colar e clicar em **Deploy function**, com o nome exatamente como acima. Depois, em **Details** de cada função, **desligue "Verify JWT"** e salve.

**Pelo terminal:**
```bash
npx supabase login
```
```bash
npx supabase functions deploy totp-enroll --no-verify-jwt --project-ref SEU_PROJECT_REF
```
```bash
npx supabase functions deploy totp-login --no-verify-jwt --project-ref SEU_PROJECT_REF
```

As funções já recebem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` automaticamente. **Nunca** coloque a service role key no app.

### 4.4 Ligar o app ao Supabase
Em **Project Settings → API**, copie a *Project URL* e a chave *anon* (ou *publishable*) e cole em [`config.js`](config.js):

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...'
};
```

A chave *anon* é pública por design. Quem protege os dados são as regras RLS do banco: cada usuário só vê os próprios registros. Depois de colar, faça o commit e o push.

### Como funciona o login
| Situação | O que acontece |
|---|---|
| **Primeiro acesso** | Você digita o e-mail e recebe um código por e-mail. Depois o app mostra o QR code ou a chave, e você toca em "Abrir no app autenticador", que no iPhone já abre o Google Authenticator. Por fim, confirma com um código do autenticador. |
| **Entrar em outro aparelho** | E-mail mais o código de 6 dígitos do autenticador. Não há senha. |
| **Continuar logado** | A sessão fica salva no aparelho. O código só é pedido de novo se você tocar em "Sair". |
| **Perdi o autenticador** | Toque em "Perdi o autenticador": você recebe um código por e-mail e cadastra um autenticador novo. O antigo deixa de funcionar. |
| **Proteção** | São no máximo 5 códigos errados a cada 15 min por e-mail, e um código já usado não vale de novo. |

> No plano grátis, o Supabase **pausa projetos sem uso por 7 dias**. Usando todo dia isso não acontece. Se pausar, basta clicar em *Restore* no painel. O app continua funcionando offline enquanto isso.

---

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html`, `styles.css` | Telas e visual |
| `app.js` | Interface, timer, histórico, conquistas, ajustes |
| `game.js` | Regras de XP, nível, sequência e conquistas, calculadas a partir das sessões |
| `store.js` | Dados no aparelho (`localStorage`), backup em JSON |
| `sync.js` | Sincronização offline-first com o Supabase |
| `auth.js` | Login por e-mail e código TOTP |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: instalação e uso offline |
| `supabase/` | Esquema do banco e Edge Functions |

Ao publicar uma versão nova, aumente `CACHE` em `sw.js` (ex.: `devocional-v2`) para os aparelhos baixarem a atualização.
