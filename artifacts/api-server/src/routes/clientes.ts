import { Router, type IRouter } from "express";
import { db, clientesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/clientes", async (req, res) => {
  try {
    const transportadoraId = req.query.transportadoraId ? parseInt(req.query.transportadoraId as string) : undefined;
    let query = db.select().from(clientesTable);
    const rows = transportadoraId
      ? await query.where(eq(clientesTable.transportadoraId, transportadoraId))
      : await query;
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing clientes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clientes", async (req, res) => {
  try {
    const { transportadoraId, nome, cnpj, email, emailFinanceiro, telefone, endereco } = req.body;
    const [created] = await db.insert(clientesTable).values({
      transportadoraId,
      nome,
      cnpj,
      email,
      emailFinanceiro,
      telefone,
      endereco,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating cliente");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
