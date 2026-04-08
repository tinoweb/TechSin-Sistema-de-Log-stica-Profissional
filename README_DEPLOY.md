# Deploy - TechSin

Este projeto está preparado para hospedagem com Docker Compose usando três serviços:

- `web`: Nginx servindo o frontend (`artifacts/flashcash-log`) e fazendo proxy de `/api`
- `api`: Express (`artifacts/api-server`)
- `db`: PostgreSQL 16

## 1) Pré-requisitos

- Docker
- Docker Compose (plugin `docker compose`)
- Porta livre no host (`WEB_PORT`, padrão `80`)

## 2) Configurar variáveis

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o `.env`:

- Defina uma senha forte em `POSTGRES_PASSWORD`
- Defina `PUBLIC_URL` com a URL final pública (ex.: `https://app.seudominio.com`)
- Ajuste `WEB_PORT` se necessário

## 3) Subir ambiente

```bash
docker compose up -d --build
```

## 4) Executar migrações do banco (primeira publicação)

Com os serviços em execução, rode:

```bash
docker compose exec api pnpm --filter @workspace/db run push
```

Se precisar forçar sincronização de schema:

```bash
docker compose exec api pnpm --filter @workspace/db run push-force
```

## 5) Verificações

- Frontend: `http://SEU_HOST:WEB_PORT/`
- Healthcheck da API (via web): `http://SEU_HOST:WEB_PORT/api/healthz`

## 6) Atualização de versão

```bash
docker compose down
docker compose up -d --build
```

## 7) Observações importantes

- O frontend usa chamadas relativas para `/api`, então `web` e `api` devem permanecer no mesmo domínio.
- O CORS da API em produção está restrito no código para domínios `techsin.com.br`; com proxy no mesmo domínio isso não impacta.
- Para HTTPS em produção, coloque um proxy reverso na frente (Nginx/Caddy/Traefik ou cloud load balancer) com certificado TLS.
