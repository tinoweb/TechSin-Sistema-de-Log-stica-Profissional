# 🧹 Limpeza de Dados de Teste — TechSin

Script para apagar dados operacionais (viagens, faturas, canhotos, etc.) de uma transportadora, deixando-a "como nova" para o cliente iniciar o uso real.

## ✅ O que é apagado
- Faturas
- XMLs importados
- Canhotos (com fotos vinculadas)
- Viagens
- Clientes
- Motoristas (e seus magic tokens)

## ✅ O que é preservado
- Cadastro da transportadora (nome, CNPJ, plano, configurações)
- Usuários (admin/operador) — para que continuem logando
- Demais transportadoras (multi-tenant intacto)

---

## 1) Identificar a transportadora

```bash
docker compose exec db psql -U techsin -d techsin -c "SELECT id, nome, cnpj FROM transportadoras ORDER BY id;"
```

Anote o `id` da empresa que será limpa (ex: `1`).

## 2) Backup (recomendado em produção)

```bash
docker compose exec db pg_dump -U techsin techsin > backup_antes_limpeza.sql
```

## 3) Executar a limpeza

### Local

```bash
docker compose cp scripts/limpar-dados-teste.sql db:/tmp/limpar.sql
docker compose exec db psql -U techsin -d techsin -v transportadora_id=1 -f /tmp/limpar.sql
```

### Produção

Mesma sequência, **conectado ao servidor de produção**:

```bash
ssh user@servidor-techsin
cd /caminho/do/projeto
docker compose cp scripts/limpar-dados-teste.sql db:/tmp/limpar.sql
docker compose exec db psql -U techsin -d techsin -v transportadora_id=<ID_REAL> -f /tmp/limpar.sql
```

## 4) Verificar

O próprio script imprime um resumo **antes** e **depois** com as contagens. Após a execução, todas devem aparecer `0`.

Você também pode validar pela tela **Super Admin** do sistema, que mostrará "0 motoristas, 0 viagens, 0 canhotos" para a transportadora.

---

## ⚠️ Importante
- **Ação irreversível.** Use o backup do passo 2 para restaurar se necessário.
- Não afeta outras transportadoras na mesma base.
- Os usuários da transportadora continuam logando normalmente.
