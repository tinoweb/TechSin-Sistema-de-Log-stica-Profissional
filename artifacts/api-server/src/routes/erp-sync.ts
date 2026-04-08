/**
 * POST /api/v1/sync-invoice
 * ERP Integration endpoint — accepts NF data from Totvs, Bling, etc.
 * Creates a viagem from the invoice data and returns a motorista magic link.
 */
import { Router, type IRouter } from "express";
import { db, viagensTable, motoristasTable, clientesTable, transportadorasTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/v1/sync-invoice", async (req, res) => {
  try {
    const {
      numeroNF, valorFrete, nomeDestinatario, cnpjDestinatario,
      emailFinanceiro, enderecoEntrega, enderecoLat, enderecoLon,
      origemERP, transportadoraId, motoristaId,
    } = req.body;

    if (!numeroNF || !valorFrete || !nomeDestinatario || !enderecoEntrega) {
      return res.status(400).json({ error: "Campos obrigatórios: numeroNF, valorFrete, nomeDestinatario, enderecoEntrega" });
    }

    // Resolve transportadora (default to 1 in demo)
    const tid = transportadoraId ?? 1;
    const [transportadora] = await db.select().from(transportadorasTable).where(eq(transportadorasTable.id, tid));
    if (!transportadora) {
      return res.status(404).json({ error: "Transportadora não encontrada" });
    }

    // Find or create cliente by CNPJ/nome
    let clienteId: number;
    if (cnpjDestinatario) {
      const existing = await db.select().from(clientesTable).where(eq(clientesTable.cnpj, cnpjDestinatario));
      if (existing.length > 0) {
        clienteId = existing[0].id;
      } else {
        const [newCliente] = await db.insert(clientesTable).values({
          transportadoraId: tid,
          nome: nomeDestinatario,
          cnpj: cnpjDestinatario,
          email: emailFinanceiro,
          emailFinanceiro: emailFinanceiro,
          endereco: enderecoEntrega,
        }).returning();
        clienteId = newCliente.id;
      }
    } else {
      const [anyCliente] = await db.select().from(clientesTable).where(eq(clientesTable.transportadoraId, tid));
      clienteId = anyCliente?.id ?? 1;
    }

    // Resolve motorista (default to first available)
    let mid = motoristaId;
    if (!mid) {
      const [m] = await db.select().from(motoristasTable).where(eq(motoristasTable.transportadoraId, tid));
      mid = m?.id ?? 1;
    }

    const [motorista] = await db.select().from(motoristasTable).where(eq(motoristasTable.id, mid));

    // Create viagem from NF data
    const [viagem] = await db.insert(viagensTable).values({
      transportadoraId: tid,
      motoristaId: mid,
      clienteId,
      numeroNF,
      valorFrete: String(valorFrete),
      origem: "ERP Import" + (origemERP ? ` (${origemERP})` : ""),
      destino: enderecoEntrega,
      status: "pendente",
      emailFinanceiro: emailFinanceiro,
      enderecoLat: enderecoLat,
      enderecoLon: enderecoLon,
    } as any).returning();

    const magicToken = motorista?.magicToken;
    const magicLink = magicToken
      ? `${req.protocol}://${req.get("host")}/flashcash-log/drive/${magicToken}`
      : null;

    return res.status(201).json({
      success: true,
      viagemId: viagem.id,
      numeroNF,
      nomeDestinatario,
      valorFrete,
      enderecoEntrega,
      magicLink,
      motoristaNome: motorista?.nome ?? null,
      message: `NF ${numeroNF} importada com sucesso. Viagem #${viagem.id} criada.`,
    });
  } catch (err) {
    req.log.error({ err }, "Error syncing invoice from ERP");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
