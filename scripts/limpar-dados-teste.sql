-- =====================================================================
-- LIMPEZA DE DADOS DE TESTE — TechSin
-- =====================================================================
-- Objetivo: Apagar todos os dados operacionais (movimentos) gerados em
-- testes de uma transportadora, deixando-a "como nova" para o cliente
-- iniciar o uso real.
--
-- O QUE É APAGADO:
--   • Faturas
--   • XMLs importados
--   • Canhotos (e fotos vinculadas)
--   • Viagens
--   • Clientes cadastrados
--   • Motoristas cadastrados
--   • Tokens de motorista (magic links)
--
-- O QUE É PRESERVADO:
--   • Cadastro da Transportadora (id, nome, CNPJ, plano, configurações)
--   • Usuários (admin/operador) — para que ainda consigam logar
--   • Dados de outras transportadoras (multi-tenant)
--
-- USO:
--   docker compose exec -T db psql -U techsin -d techsin \
--     -v transportadora_id=1 -f /scripts/limpar-dados-teste.sql
--
-- ⚠️  AÇÃO IRREVERSÍVEL — faça backup antes em ambientes críticos:
--   docker compose exec db pg_dump -U techsin techsin > backup.sql
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Captura o id alvo (passado via -v transportadora_id=NNN)
\set tid :transportadora_id

-- Mostra um resumo antes
SELECT
  (SELECT nome FROM transportadoras WHERE id = :tid) AS transportadora,
  (SELECT COUNT(*) FROM faturas    WHERE transportadora_id = :tid) AS faturas,
  (SELECT COUNT(*) FROM xmls       WHERE transportadora_id = :tid) AS xmls,
  (SELECT COUNT(*) FROM viagens    WHERE transportadora_id = :tid) AS viagens,
  (SELECT COUNT(*) FROM clientes   WHERE transportadora_id = :tid) AS clientes,
  (SELECT COUNT(*) FROM motoristas WHERE transportadora_id = :tid) AS motoristas;

-- 1) Faturas (dependem de viagens/canhotos/xmls — apagar primeiro)
DELETE FROM faturas WHERE transportadora_id = :tid;

-- 2) XMLs vinculados à transportadora
DELETE FROM xmls WHERE transportadora_id = :tid;

-- 3) Canhotos cujas viagens pertencem à transportadora
DELETE FROM canhotos
 WHERE viagem_id IN (
   SELECT id FROM viagens WHERE transportadora_id = :tid
 );

-- 4) Viagens
DELETE FROM viagens WHERE transportadora_id = :tid;

-- 5) Clientes
DELETE FROM clientes WHERE transportadora_id = :tid;

-- 6) Motoristas (e seus tokens, se a tabela existir)
DELETE FROM motoristas WHERE transportadora_id = :tid;

-- Resumo pós-limpeza (esperado: tudo zerado)
SELECT
  (SELECT nome FROM transportadoras WHERE id = :tid) AS transportadora,
  (SELECT COUNT(*) FROM faturas    WHERE transportadora_id = :tid) AS faturas,
  (SELECT COUNT(*) FROM xmls       WHERE transportadora_id = :tid) AS xmls,
  (SELECT COUNT(*) FROM viagens    WHERE transportadora_id = :tid) AS viagens,
  (SELECT COUNT(*) FROM clientes   WHERE transportadora_id = :tid) AS clientes,
  (SELECT COUNT(*) FROM motoristas WHERE transportadora_id = :tid) AS motoristas;

COMMIT;
