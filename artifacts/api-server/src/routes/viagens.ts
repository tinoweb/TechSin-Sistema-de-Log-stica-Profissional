import { Router, type IRouter } from "express";
import { db, viagensTable, motoristasTable, clientesTable, xmlsTable } from "@workspace/db";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { resolveTenantId, requireTenantId, TenantScopeError } from "../lib/tenant-scope";

const router: IRouter = Router();

router.get("/viagens", async (req, res) => {
  try {
    const transportadoraId = resolveTenantId(req);
    const motoristaId = req.query.motoristaId ? parseInt(req.query.motoristaId as string) : undefined;
    const status = req.query.status as string | undefined;

    const conditions = [];
    if (typeof transportadoraId === "number") conditions.push(eq(viagensTable.transportadoraId, transportadoraId));
    if (motoristaId) conditions.push(eq(viagensTable.motoristaId, motoristaId));
    if (status) conditions.push(eq(viagensTable.status, status as any));

    const rows = conditions.length > 0
      ? await db.select().from(viagensTable).where(and(...conditions))
      : await db.select().from(viagensTable);

    const enriched = await Promise.all(rows.map(async (v) => {
      const [motorista] = await db.select({ nome: motoristasTable.nome }).from(motoristasTable).where(eq(motoristasTable.id, v.motoristaId));
      const [cliente] = await db.select({ nome: clientesTable.nome }).from(clientesTable).where(eq(clientesTable.id, v.clienteId));
      return {
        ...v,
        motoristaNome: motorista?.nome,
        clienteNome: cliente?.nome,
        valorFrete: parseFloat(v.valorFrete as string),
      };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error listing viagens");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/viagens", async (req, res) => {
  try {
    let transportadoraId: number;
    try { transportadoraId = requireTenantId(req); }
    catch (e) { if (e instanceof TenantScopeError) return res.status(400).json({ error: e.message }); throw e; }
    const { motoristaId, clienteId, numeroNF, valorFrete, origem, destino, dataPartida } = req.body;
    const [created] = await db.insert(viagensTable).values({
      transportadoraId,
      motoristaId,
      clienteId,
      numeroNF,
      valorFrete: valorFrete.toString(),
      origem,
      destino,
      status: "em_transito",
      dataPartida: dataPartida ? new Date(dataPartida) : new Date(),
    }).returning();

    await db.update(motoristasTable)
      .set({ status: "em_rota" })
      .where(eq(motoristasTable.id, motoristaId));

    res.status(201).json({ ...created, valorFrete: parseFloat(created.valorFrete as string) });
  } catch (err) {
    req.log.error({ err }, "Error creating viagem");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Viagens pendentes de canhoto (criadas por upload, sem canhoto ainda) ── */
router.get("/viagens/pendentes-canhoto", async (req, res) => {
  try {
    const transportadoraId = resolveTenantId(req);
    const baseConditions = [
      eq(viagensTable.status, "pendente"),
      isNull(viagensTable.canhotoId),
    ];
    if (typeof transportadoraId === "number") {
      baseConditions.push(eq(viagensTable.transportadoraId, transportadoraId));
    }
    const rows = await db.select().from(viagensTable).where(and(...baseConditions));

    const enriched = await Promise.all(rows.map(async (v) => {
      const [motorista] = v.motoristaId
        ? await db.select({ nome: motoristasTable.nome }).from(motoristasTable).where(eq(motoristasTable.id, v.motoristaId))
        : [null];
      const [cliente] = v.clienteId
        ? await db.select({ nome: clientesTable.nome, email: clientesTable.email }).from(clientesTable).where(eq(clientesTable.id, v.clienteId))
        : [null];
      return {
        ...v,
        valorFrete:    parseFloat(v.valorFrete as string),
        motoristaNome: motorista?.nome ?? null,
        clienteNome:   cliente?.nome ?? null,
        clienteEmail:  cliente?.email ?? null,
      };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error listing pending viagens");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /viagens/:id ───────────────────────────────────────────────────── */
router.get("/viagens/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const [row] = await db.select().from(viagensTable).where(eq(viagensTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });

    const [motorista] = row.motoristaId
      ? await db.select({ nome: motoristasTable.nome }).from(motoristasTable).where(eq(motoristasTable.id, row.motoristaId))
      : [null];
    const [cliente] = row.clienteId
      ? await db.select({ nome: clientesTable.nome, email: clientesTable.email }).from(clientesTable).where(eq(clientesTable.id, row.clienteId))
      : [null];

    res.json({
      ...row,
      motoristaNome: motorista?.nome ?? null,
      clienteNome:   cliente?.nome ?? null,
      clienteEmail:  cliente?.email ?? null,
      valorFrete:    parseFloat(row.valorFrete as string),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting viagem");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
