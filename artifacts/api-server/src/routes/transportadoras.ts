import { Router, type IRouter } from "express";
import { db, transportadorasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/transportadoras", async (req, res) => {
  try {
    const rows = await db.select().from(transportadorasTable);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing transportadoras");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transportadoras", async (req, res) => {
  try {
    const { nome, cnpj, email, telefone, emailFinanceiro } = req.body;
    const [created] = await db.insert(transportadorasTable).values({
      nome,
      cnpj,
      email,
      telefone,
      emailFinanceiro,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating transportadora");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/transportadoras/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Error getting transportadora");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
