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

/* ── Atualização de dados do cliente ──
 * Usado principalmente para atualizar email de faturamento
 * quando OCR cadastra cliente automaticamente com placeholder. */
router.patch("/clientes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

    const { nome, cnpj, email, emailFinanceiro, telefone, endereco } = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (typeof nome === "string" && nome.trim())     updates.nome = nome.trim();
    if (typeof cnpj === "string" && cnpj.trim())     updates.cnpj = cnpj.trim();
    if (typeof email === "string" && email.trim())   updates.email = email.trim();
    if (typeof emailFinanceiro === "string")         updates.emailFinanceiro = emailFinanceiro.trim() || null;
    if (typeof telefone === "string")                updates.telefone = telefone.trim() || null;
    if (typeof endereco === "string")                updates.endereco = endereco.trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido enviado" });
    }

    const [updated] = await db.update(clientesTable)
      .set(updates)
      .where(eq(clientesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Cliente não encontrado" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating cliente");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
