import { Router, type IRouter } from "express";
import { db, motoristasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { resolveTenantId, requireTenantId, TenantScopeError } from "../lib/tenant-scope";

const router: IRouter = Router();

// Gerar ou atualizar magic token para um motorista
router.post("/motoristas/:id/generate-token", async (req, res) => {
  try {
    const motoristaId = parseInt(req.params.id);
    const tenantId = resolveTenantId(req);

    // Verificar se motorista existe
    const [motorista] = await db.select().from(motoristasTable)
      .where(eq(motoristasTable.id, motoristaId));

    if (!motorista) {
      return res.status(404).json({ error: "Motorista não encontrado" });
    }
    if (typeof tenantId === "number" && motorista.transportadoraId !== tenantId) {
      return res.status(403).json({ error: "Motorista nao pertence a sua empresa" });
    }

    // Gerar novo token único
    const magicToken = randomBytes(32).toString('hex');
    
    // Atualizar motorista com o novo token
    const [updated] = await db.update(motoristasTable)
      .set({ magicToken })
      .where(eq(motoristasTable.id, motoristaId))
      .returning();

    // Gerar link completo
    const baseUrl = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/drive/${magicToken}`;

    req.log.info({ motoristaId, magicToken: magicToken.slice(0, 8) + '...' }, "Magic token gerado");

    res.json({
      success: true,
      motorista: updated,
      magicToken,
      magicLink,
      message: `Token gerado para ${updated.nome}`
    });

  } catch (err) {
    req.log.error({ err }, "Erro ao gerar magic token");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// Gerar tokens para todos os motoristas sem token
router.post("/motoristas/generate-all-tokens", async (req, res) => {
  try {
    let transportadoraId: number;
    try { transportadoraId = requireTenantId(req); }
    catch (e) { if (e instanceof TenantScopeError) return res.status(400).json({ error: e.message }); throw e; }
    
    // Buscar motoristas sem token
    const motoristas = await db.select().from(motoristasTable)
      .where(eq(motoristasTable.transportadoraId, transportadoraId));
    
    const semToken = motoristas.filter(m => !m.magicToken);
    
    if (semToken.length === 0) {
      return res.json({
        success: true,
        message: "Todos os motoristas já possuem tokens",
        updated: 0
      });
    }

    const baseUrl = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const results = [];

    // Gerar token para cada motorista
    for (const motorista of semToken) {
      const magicToken = randomBytes(32).toString('hex');
      
      const [updated] = await db.update(motoristasTable)
        .set({ magicToken })
        .where(eq(motoristasTable.id, motorista.id))
        .returning();

      const magicLink = `${baseUrl}/drive/${magicToken}`;
      
      results.push({
        id: updated.id,
        nome: updated.nome,
        magicToken,
        magicLink
      });
    }

    req.log.info({ count: results.length }, "Tokens gerados em lote");

    res.json({
      success: true,
      message: `${results.length} tokens gerados`,
      updated: results.length,
      motoristas: results
    });

  } catch (err) {
    req.log.error({ err }, "Erro ao gerar tokens em lote");
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
