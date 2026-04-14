#!/usr/bin/env tsx
/**
 * Script para testar o fluxo completo do sistema TechSin
 * 1. Gerar tokens para motoristas
 * 2. Criar XML/OCR simulado
 * 3. Verificar dashboard
 * 4. Testar link do motorista
 */

import { db, motoristasTable, xmlsTable, viagensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

async function main() {
  console.log("🚀 Testando fluxo completo do TechSin...\n");

  // 1. Gerar tokens para motoristas sem token
  console.log("1️⃣ Gerando magic tokens para motoristas...");
  const motoristas = await db.select().from(motoristasTable).where(eq(motoristasTable.transportadoraId, 1));
  
  let tokensGerados = 0;
  for (const motorista of motoristas) {
    if (!motorista.magicToken) {
      const magicToken = randomBytes(32).toString('hex');
      await db.update(motoristasTable)
        .set({ magicToken })
        .where(eq(motoristasTable.id, motorista.id));
      
      console.log(`   ✅ Token gerado para ${motorista.nome}: ${magicToken.slice(0, 8)}...`);
      tokensGerados++;
    } else {
      console.log(`   ℹ️  ${motorista.nome} já possui token: ${motorista.magicToken.slice(0, 8)}...`);
    }
  }
  
  if (tokensGerados === 0) {
    console.log("   ✅ Todos os motoristas já possuem tokens!");
  }

  // 2. Verificar XMLs processados
  console.log("\n2️⃣ Verificando XMLs processados...");
  const xmls = await db.select().from(xmlsTable).where(eq(xmlsTable.transportadoraId, 1));
  
  console.log(`   📄 Total de XMLs: ${xmls.length}`);
  console.log(`   ⏳ Pendentes: ${xmls.filter(x => x.status === 'pendente').length}`);
  console.log(`   🔄 Processando: ${xmls.filter(x => x.status === 'processando').length}`);
  console.log(`   ✅ Conciliados: ${xmls.filter(x => x.status === 'conciliado').length}`);

  // 3. Verificar viagens criadas
  console.log("\n3️⃣ Verificando viagens...");
  const viagens = await db.select().from(viagensTable).where(eq(viagensTable.transportadoraId, 1));
  
  console.log(`   🚛 Total de viagens: ${viagens.length}`);
  console.log(`   ⏳ Pendentes: ${viagens.filter(v => v.status === 'pendente').length}`);
  console.log(`   🚚 Em trânsito: ${viagens.filter(v => v.status === 'em_transito').length}`);
  console.log(`   ✅ Validadas: ${viagens.filter(v => v.status === 'validado').length}`);
  console.log(`   💰 Faturadas: ${viagens.filter(v => v.status === 'faturado').length}`);

  // 4. Mostrar links dos motoristas
  console.log("\n4️⃣ Links dos motoristas:");
  const motoristasComToken = await db.select().from(motoristasTable)
    .where(eq(motoristasTable.transportadoraId, 1));
  
  for (const motorista of motoristasComToken) {
    if (motorista.magicToken) {
      const link = `https://techsin.site/drive/${motorista.magicToken}`;
      console.log(`   🔗 ${motorista.nome}: ${link}`);
    }
  }

  // 5. Estatísticas do sistema
  console.log("\n5️⃣ Estatísticas do sistema:");
  const valorTotal = viagens.reduce((sum, v) => sum + parseFloat(v.valorFrete as string || '0'), 0);
  const valorValidado = viagens
    .filter(v => v.status === 'validado' || v.status === 'faturado')
    .reduce((sum, v) => sum + parseFloat(v.valorFrete as string || '0'), 0);
  
  console.log(`   💰 Valor total em viagens: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   ✅ Valor validado: R$ ${valorValidado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   📊 Taxa de validação: ${viagens.length > 0 ? ((valorValidado / valorTotal) * 100).toFixed(1) : 0}%`);

  console.log("\n✅ Teste completo finalizado!");
  console.log("\n📋 Próximos passos:");
  console.log("   1. Acesse https://techsin.site/dashboard para ver o painel");
  console.log("   2. Vá em 'Motoristas' para enviar links via WhatsApp");
  console.log("   3. Teste o upload de XML em 'Novo Frete'");
  console.log("   4. Verifique a 'Fila de Conferência' para aprovar canhotos");
}

main().catch(console.error);
