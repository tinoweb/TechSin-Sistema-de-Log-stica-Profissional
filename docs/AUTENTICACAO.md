# Autenticação & Multi-Tenant — TechSin

Documento de referência para o módulo de login/sessão e isolamento por
transportadora (SaaS multi-tenant) introduzido na Fase 1 do plano.

## Visão geral

- **Tecnologia**: JWT (HS256) em cookie `HttpOnly + SameSite=Lax`,
  Secure em produção.
- **Hash de senha**: `bcryptjs` (10 rounds).
- **Sessão**: 7 dias (configurável via `JWT_EXPIRES_IN`).
- **Isolamento**: todas as rotas `/api/*` passam pelo `authGuard`.
  Exceções públicas: `/api/healthz`, `/api/auth/login`, `/api/auth/logout`,
  `/api/motoristas/by-token/:token` (magic link) e `/api/viagens/:id`
  (usado pela tela pública de entrega).

## Papéis (roles)

| Role          | Pode ver                              | Pode escrever                 |
| ------------- | ------------------------------------- | ----------------------------- |
| `superadmin`  | Todos os tenants (global)              | Criar/editar transportadoras  |
| `admin`       | Apenas a própria transportadora        | Tudo do próprio tenant         |
| `operador`    | Apenas a própria transportadora        | Viagens, canhotos, motoristas  |
| `financeiro`  | Apenas a própria transportadora        | Faturas, clientes (read-heavy) |

O isolamento é **estrito**: o backend ignora `?transportadoraId=` vindo
do cliente para usuários não-superadmin, usando sempre o `transportadoraId`
do JWT. Apenas o superadmin pode passar `?transportadoraId=X` para
operar em outro tenant.

## Variáveis de ambiente

Adicione no `.env` (ou `.env.docker`):

```ini
# Obrigatório em produção. Gere com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=troque-por-uma-string-aleatoria-longa

# Opcional (default 7d). Aceita formato do jsonwebtoken: 7d, 12h, 30m...
JWT_EXPIRES_IN=7d

# Opcional — força cookie Secure mesmo em dev
NODE_ENV=production
```

**Em produção sem `JWT_SECRET`, a API aborta no boot**
(ver `artifacts/api-server/src/lib/auth.ts`).

## Setup inicial (primeira vez)

```powershell
# 1) Instalar dependências novas
pnpm install

# 2) Aplicar schema (tabela `usuarios`)
pnpm --filter @workspace/db push

# 3) Criar superadmin + admin inicial
pnpm --filter @workspace/scripts seed-usuarios
```

O script `seed-usuarios`:

- cria `dono@techsin.com.br / Troque@2026!` como **superadmin global**;
- cria `admin@transportadora.com.br / Troque@2026!` vinculado à
  primeira transportadora encontrada no banco (use `seed-flashcash`
  antes se o banco estiver vazio).

Sobrescreva os valores padrão via env:
`SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_SENHA`, `SEED_SUPERADMIN_NOME`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_SENHA`, `SEED_ADMIN_NOME`.

⚠️ **Troque as senhas padrão no primeiro login em produção.**

## Fluxo no frontend

1. Usuário acessa `/` → vê `login.tsx`.
2. `login.tsx` envia `POST /api/auth/login` com `{ email, senha }`.
3. Backend responde com `Set-Cookie: techsin_session=<jwt>; HttpOnly`.
4. `AuthProvider` (`src/hooks/use-auth.tsx`) guarda `user` em memória e
   todas as chamadas subsequentes enviam o cookie (`credentials: include`).
5. `ProtectedRoute` envolve o layout admin — se receber 401 ou não tiver
   usuário, redireciona para `/`.
6. Superadmins ganham item de menu extra (`Super Admin`) e acesso à
   rota `/super-admin`.

## Endpoints de auth

| Método  | Path                 | Quem pode acessar | Retorno                                   |
| ------- | -------------------- | ----------------- | ----------------------------------------- |
| POST    | `/api/auth/login`    | Público            | `{ user }` + cookie                        |
| POST    | `/api/auth/logout`   | Público            | `{ ok: true }` + limpa cookie              |
| GET     | `/api/auth/me`       | Autenticado         | Dados públicos do usuário + transportadora |

## Como adicionar um novo usuário

Hoje não há UI para criar usuários — faça via SQL ou script:

```sql
INSERT INTO usuarios (transportadora_id, nome, email, senha_hash, role)
VALUES (
  1,                                         -- id da transportadora
  'Fulano Silva',
  'fulano@empresa.com.br',
  '<bcrypt-hash>',                           -- gere com bcrypt.hash(senha, 10)
  'operador'
);
```

Ou, via Node REPL:

```js
const bcrypt = require("bcryptjs");
console.log(await bcrypt.hash("senha-inicial", 10));
```

Futuro (Fase 2): tela administrativa para convidar usuários via
e-mail + redefinir senhas.

## Debug comum

- **"Sessao invalida"** → Cookie expirou ou `JWT_SECRET` mudou.
  Deslogue e entre novamente.
- **"Conta inativa"** → O registro na tabela `usuarios` tem `ativo=false`.
- **403 em `/super-admin/*`** → Token não é do papel `superadmin`.
- **401 em toda navegação** → Verifique se o browser está enviando o
  cookie. Em dev com front + API em portas diferentes, use CORS com
  `credentials: true` (já configurado) e o front deve chamar via
  `credentials: "include"` (já configurado em `api-client.ts`).
