import { Router, type IRouter } from "express";
import { db, clientesTable, transportadorasTable } from "@workspace/db";
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

    const parsedTransportadoraId = Number(transportadoraId);
    if (!Number.isInteger(parsedTransportadoraId) || parsedTransportadoraId <= 0) {
      return res.status(400).json({ error: "transportadoraId inválido" });
    }

    if (typeof nome !== "string" || !nome.trim()) {
      return res.status(400).json({ error: "nome é obrigatório" });
    }

    if (typeof cnpj !== "string" || !cnpj.trim()) {
      return res.status(400).json({ error: "cnpj é obrigatório" });
    }

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "email é obrigatório" });
    }

    const [transportadora] = await db
      .select({ id: transportadorasTable.id })
      .from(transportadorasTable)
      .where(eq(transportadorasTable.id, parsedTransportadoraId));

    if (!transportadora) {
      return res.status(400).json({ error: "Transportadora não encontrada" });
    }

    const [created] = await db.insert(clientesTable).values({
      transportadoraId: parsedTransportadoraId,
      nome: nome.trim(),
      cnpj: cnpj.trim(),
      email: email.trim(),
      emailFinanceiro,
      telefone,
      endereco,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Error creating cliente");

    const dbErr = err as { code?: string; constraint?: string };
    if (dbErr.code === "23503") {
      return res.status(400).json({ error: "Transportadora inválida" });
    }

    if (dbErr.code === "23502") {
      return res.status(400).json({ error: "Campos obrigatórios ausentes" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
