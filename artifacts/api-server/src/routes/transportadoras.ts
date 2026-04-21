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

/* ── Atualização de transportadora ──
 * Usado principalmente para configurar o nome comercial exibido como
 * remetente dos e-mails (white-label por cliente SaaS). */
router.patch("/transportadoras/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id inválido" });

    const { nome, cnpj, email, telefone, emailFinanceiro, emailRemetente, ativo, plano } = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (typeof nome === "string" && nome.trim())             updates.nome = nome.trim();
    if (typeof cnpj === "string" && cnpj.trim())             updates.cnpj = cnpj.trim();
    if (typeof email === "string" && email.trim())           updates.email = email.trim();
    if (typeof telefone === "string")                        updates.telefone = telefone.trim() || null;
    if (typeof emailFinanceiro === "string")                 updates.emailFinanceiro = emailFinanceiro.trim() || null;
    if (typeof emailRemetente === "string")                  updates.emailRemetente = emailRemetente.trim() || null;
    if (typeof ativo === "boolean")                          updates.ativo = ativo;
    if (typeof plano === "string" && ["starter","pro","enterprise"].includes(plano))
                                                             updates.plano = plano;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido enviado" });
    }

    const [updated] = await db.update(transportadorasTable)
      .set(updates)
      .where(eq(transportadorasTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Transportadora não encontrada" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating transportadora");
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
