import { Router, type IRouter } from "express";
import { db, transportadorasTable, motoristasTable, canhotosTable, viagensTable, clientesTable, faturasTable, xmlsTable } from "@workspace/db";
import { eq, count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/super-admin/stats", async (req, res) => {
  try {
    const transportadoras = await db.select().from(transportadorasTable).orderBy(transportadorasTable.id);
    const totalMotoristas = await db.select({ count: count() }).from(motoristasTable);
    const totalViagens = await db.select({ count: count() }).from(viagensTable);
    const totalCanhotos = await db.select({ count: count() }).from(canhotosTable);
    const canhotosValidados = await db.select({ count: count() }).from(canhotosTable).where(eq(canhotosTable.status, "validado"));

    const enriched = await Promise.all(transportadoras.map(async (t) => {
      const motoristas = await db.select({ count: count() }).from(motoristasTable).where(eq(motoristasTable.transportadoraId, t.id));
      const viagens = await db.select({ count: count() }).from(viagensTable).where(eq(viagensTable.transportadoraId, t.id));
      const canhotos = await db.select({ count: count() }).from(canhotosTable);
      return {
        ...t,
        totalMotoristasAtivos: motoristas[0]?.count ?? 0,
        totalViagens: viagens[0]?.count ?? 0,
        canhotosDigitalizados: canhotos[0]?.count ?? 0,
      };
    }));

    res.json({
      transportadoras: enriched,
      global: {
        totalTransportadoras: transportadoras.length,
        ativas: transportadoras.filter(t => t.ativo).length,
        bloqueadas: transportadoras.filter(t => !t.ativo).length,
        totalMotoristas: totalMotoristas[0]?.count ?? 0,
        totalViagens: totalViagens[0]?.count ?? 0,
        totalCanhotos: totalCanhotos[0]?.count ?? 0,
        canhotosValidados: canhotosValidados[0]?.count ?? 0,
      }
    });
  } catch (err) {
    req.log.error({ err }, "Error getting super admin stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/super-admin/transportadoras/:id/toggle", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [current] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, id));
    if (!current) return res.status(404).json({ error: "Not found" });
    const [updated] = await db.update(transportadorasTable)
      .set({ ativo: !current.ativo })
      .where(eq(transportadorasTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error toggling transportadora status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/super-admin/transportadoras", async (req, res) => {
  try {
    const { nome, cnpj, email, telefone, emailFinanceiro, plano } = req.body;
    const [created] = await db.insert(transportadorasTable).values({
      nome, cnpj, email, telefone, emailFinanceiro,
      plano: plano ?? "starter",
      ativo: true,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating transportadora via super admin");
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

router.post("/super-admin/transportadoras/:id/clear", async (req, res) => {
  try {
    const transportadoraId = parseInt(req.params.id);
    
    // Apagar Faturas
    await db.delete(faturasTable).where(eq(faturasTable.transportadoraId, transportadoraId));
    
    // Apagar XMLs
    await db.delete(xmlsTable).where(eq(xmlsTable.transportadoraId, transportadoraId));
    
    // Canhotos (estão vinculados à viagem)
    const canhotosRes = await db.select({ id: canhotosTable.id })
      .from(canhotosTable)
      .innerJoin(viagensTable, eq(canhotosTable.viagemId, viagensTable.id))
      .where(eq(viagensTable.transportadoraId, transportadoraId));
      
    if (canhotosRes.length > 0) {
      for (const c of canhotosRes) {
        await db.delete(canhotosTable).where(eq(canhotosTable.id, c.id));
      }
    }
    
    // Apagar Viagens
    await db.delete(viagensTable).where(eq(viagensTable.transportadoraId, transportadoraId));
    
    // Apagar Clientes
    await db.delete(clientesTable).where(eq(clientesTable.transportadoraId, transportadoraId));
    
    // Apagar Motoristas
    await db.delete(motoristasTable).where(eq(motoristasTable.transportadoraId, transportadoraId));
    
    req.log.info({ transportadoraId }, "Dados de teste limpos com sucesso");
    res.json({ success: true, message: "Ambiente limpo! Pronto para uso real." });
  } catch (err) {
    req.log.error({ err }, "Error clearing transportadora data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
