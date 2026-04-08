import { Router, type IRouter } from "express";
import { db, motoristasTable, viagensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/motoristas", async (req, res) => {
  try {
    const transportadoraId = req.query.transportadoraId ? parseInt(req.query.transportadoraId as string) : undefined;
    let query = db.select().from(motoristasTable);
    const rows = transportadoraId
      ? await query.where(eq(motoristasTable.transportadoraId, transportadoraId))
      : await query;
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing motoristas");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/motoristas", async (req, res) => {
  try {
    const { transportadoraId, nome, cpf, telefone, email, cnh } = req.body;
    const [created] = await db.insert(motoristasTable).values({
      transportadoraId, nome, cpf, telefone, email, cnh, status: "ativo",
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating motorista");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/motoristas/by-token/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const [motorista] = await db.select().from(motoristasTable).where(eq(motoristasTable.magicToken, token));
    if (!motorista) return res.status(404).json({ error: "Link inválido ou expirado" });

    // Get pending deliveries for this driver
    const viagens = await db.select().from(viagensTable).where(eq(viagensTable.motoristaId, motorista.id));

    res.json({ motorista, viagens });
  } catch (err) {
    req.log.error({ err }, "Error getting motorista by token");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/motoristas/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(motoristasTable).where(eq(motoristasTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Error getting motorista");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
