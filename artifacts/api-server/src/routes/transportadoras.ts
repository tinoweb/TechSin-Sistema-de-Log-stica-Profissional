import { Router, type IRouter } from "express";
import { db, transportadorasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveTenantId } from "../lib/tenant-scope";

const router: IRouter = Router();

/* Admin/operador/financeiro: retorna apenas a propria transportadora.
 * Superadmin: retorna todas (para o painel global). */
router.get("/transportadoras", async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const rows = typeof tenantId === "number"
      ? await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, tenantId))
      : await db.select().from(transportadorasTable);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing transportadoras");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* Criacao de nova transportadora e operacao exclusiva do superadmin
 * (ja protegida por /super-admin via requireSuperAdmin no router index). */
router.post("/transportadoras", async (req, res) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ error: "Apenas superadmin pode criar transportadoras" });
  }
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

    const tenantId = resolveTenantId(req);
    if (typeof tenantId === "number" && tenantId !== id) {
      return res.status(403).json({ error: "Nao pode editar outra empresa" });
    }
    /* Apenas superadmin pode alterar ativo/plano. */
    if (req.user?.role !== "superadmin") {
      delete (req.body as any).ativo;
      delete (req.body as any).plano;
    }

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
    const tenantId = resolveTenantId(req);
    if (typeof tenantId === "number" && tenantId !== id) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    const [row] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Error getting transportadora");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
