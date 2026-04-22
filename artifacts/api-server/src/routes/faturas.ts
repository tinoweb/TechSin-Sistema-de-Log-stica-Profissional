import { Router, type IRouter } from "express";
import { db, faturasTable, clientesTable, viagensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { resolveTenantId, requireTenantId, TenantScopeError } from "../lib/tenant-scope";

const router: IRouter = Router();

function parseFatura(f: any) {
  return {
    ...f,
    valor: parseFloat(f.valor as string),
    valorAntecipado: f.valorAntecipado ? parseFloat(f.valorAntecipado as string) : null,
    taxaAntecipacao: f.taxaAntecipacao ? parseFloat(f.taxaAntecipacao as string) : null,
  };
}

router.get("/faturas", async (req, res) => {
  try {
    const transportadoraId = resolveTenantId(req);
    const status = req.query.status as string | undefined;

    let rows = typeof transportadoraId === "number"
      ? await db.select().from(faturasTable).where(eq(faturasTable.transportadoraId, transportadoraId))
      : await db.select().from(faturasTable);

    if (status) rows = rows.filter(f => f.status === status);

    const enriched = await Promise.all(rows.map(async (f) => {
      const [cliente] = await db.select({ nome: clientesTable.nome, email: clientesTable.emailFinanceiro }).from(clientesTable).where(eq(clientesTable.id, f.clienteId));
      return { ...parseFatura(f), clienteNome: cliente?.nome, clienteEmail: cliente?.email };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error listing faturas");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/faturas", async (req, res) => {
  try {
    let transportadoraId: number;
    try { transportadoraId = requireTenantId(req); }
    catch (e) { if (e instanceof TenantScopeError) return res.status(400).json({ error: e.message }); throw e; }
    const { clienteId, viagemId, canhotoId, xmlId, valor, dataVencimento } = req.body;
    const numeroFatura = `FAT-${Date.now().toString(36).toUpperCase()}`;

    const [created] = await db.insert(faturasTable).values({
      transportadoraId,
      clienteId,
      viagemId,
      canhotoId,
      xmlId,
      numeroFatura,
      valor: valor.toString(),
      dataVencimento: dataVencimento ? new Date(dataVencimento) : undefined,
      dataEmissao: new Date(),
    }).returning();

    await db.update(viagensTable)
      .set({ status: "faturado" })
      .where(eq(viagensTable.id, viagemId));

    const [cliente] = await db.select({ nome: clientesTable.nome, email: clientesTable.emailFinanceiro }).from(clientesTable).where(eq(clientesTable.id, clienteId));

    res.status(201).json({ ...parseFatura(created), clienteNome: cliente?.nome, clienteEmail: cliente?.email });
  } catch (err) {
    req.log.error({ err }, "Error creating fatura");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/faturas/:id/enviar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(faturasTable)
      .set({ status: "enviado", kitEnviadoEm: new Date() })
      .where(eq(faturasTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    const [cliente] = await db.select({ nome: clientesTable.nome, email: clientesTable.emailFinanceiro }).from(clientesTable).where(eq(clientesTable.id, updated.clienteId));
    res.json({ ...parseFatura(updated), clienteNome: cliente?.nome, clienteEmail: cliente?.email });
  } catch (err) {
    req.log.error({ err }, "Error sending fatura");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/faturas/:id/antecipar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [fatura] = await db.select().from(faturasTable).where(eq(faturasTable.id, id));
    if (!fatura) return res.status(404).json({ error: "Not found" });

    const valorOriginal = parseFloat(fatura.valor as string);
    const taxa = 0.015;
    const valorAntecipado = valorOriginal * (1 - taxa);

    const [updated] = await db.update(faturasTable)
      .set({
        status: "antecipado",
        valorAntecipado: valorAntecipado.toString(),
        taxaAntecipacao: taxa.toString(),
        antecipacaoSolicitadaEm: new Date(),
      })
      .where(eq(faturasTable.id, id))
      .returning();

    const [cliente] = await db.select({ nome: clientesTable.nome, email: clientesTable.emailFinanceiro }).from(clientesTable).where(eq(clientesTable.id, updated.clienteId));
    res.json({ ...parseFatura(updated), clienteNome: cliente?.nome, clienteEmail: cliente?.email });
  } catch (err) {
    req.log.error({ err }, "Error processing anticipation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
