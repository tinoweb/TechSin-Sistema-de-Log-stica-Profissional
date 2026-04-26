import { db, faturasTable, xmlsTable, canhotosTable, viagensTable, clientesTable, motoristasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/src/schema";

async function clearTransportadoraData(transportadoraId: number) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada no .env.");
  }
  console.log(`Iniciando limpeza dos dados de testes para Transportadora ID ${transportadoraId}...`);

  // Conectar usando postgres (Drizzle)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const database = drizzle(pool, { schema });

  try {
    // Apagar faturas
    console.log("Removendo faturas...");
    await database.delete(faturasTable).where(eq(faturasTable.transportadoraId, transportadoraId));

    // Apagar XMLs
    console.log("Removendo XMLs...");
    await database.delete(xmlsTable).where(eq(xmlsTable.transportadoraId, transportadoraId));

    // Apagar Canhotos (depende de viagens, mas também viagens dependem dele. Apagar ambos).
    // Canhotos tem transportadoraId? Em db/schema/canhotos.ts não tem transportadoraId, mas vi que a viagemId tem.
    // Vamos checar schema de canhotos
    const canhotosRes = await database.select({ id: canhotosTable.id })
      .from(canhotosTable)
      .innerJoin(viagensTable, eq(canhotosTable.viagemId, viagensTable.id))
      .where(eq(viagensTable.transportadoraId, transportadoraId));
    
    if (canhotosRes.length > 0) {
      console.log(`Removendo ${canhotosRes.length} canhotos associados...`);
      for (const c of canhotosRes) {
        await database.delete(canhotosTable).where(eq(canhotosTable.id, c.id));
      }
    } else {
      console.log("Nenhum canhoto encontrado.");
    }

    // Apagar Viagens
    console.log("Removendo viagens...");
    await database.delete(viagensTable).where(eq(viagensTable.transportadoraId, transportadoraId));

    // Apagar Clientes
    console.log("Removendo clientes...");
    await database.delete(clientesTable).where(eq(clientesTable.transportadoraId, transportadoraId));

    // Apagar Motoristas
    console.log("Removendo motoristas...");
    await database.delete(motoristasTable).where(eq(motoristasTable.transportadoraId, transportadoraId));

    console.log("✅ Limpeza concluída! Ambiente limpo e pronto para uso real.");
  } catch (error) {
    console.error("❌ Erro durante a limpeza:", error);
  } finally {
    await pool.end();
  }
}

// Assumindo a principal como transportadoraId = 1 (se precisar de outra pode passar por argumento)
const targetId = process.argv[2] ? parseInt(process.argv[2]) : 1;
clearTransportadoraData(targetId);
