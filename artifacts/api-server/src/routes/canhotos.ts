import { Router, type IRouter } from "express";
import { db, canhotosTable, viagensTable, faturasTable, motoristasTable, clientesTable, xmlsTable, transportadorasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendBillingEmail } from "../services/email";
import { extractDocumentDataWithTimeout, computeConfidence } from "../services/ocr";

const router: IRouter = Router();

function haversineMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post("/viagens/:id/canhoto", async (req, res) => {
  try {
    const viagemId = parseInt(req.params.id);
    const [viagem] = await db.select().from(viagensTable).where(eq(viagensTable.id, viagemId));
    if (!viagem) return res.status(404).json({ error: "Viagem not found" });

    const { fotoUrl, latitude, longitude, numeroCte, capturedAt } = req.body;
    // Hints enviados pelo cliente (opcionais). O OCR é quem decide de verdade.
    let { cnpjCliente, numeroNF, valorDetectado, assinaturaDetectada } = req.body;

    const sealId = `SEAL-${randomUUID().substring(0, 8).toUpperCase()}`;

    /* ── Análise IA (OCR + assinatura + confiança) ─────────────────
     * Executa com timeout de 20s para não travar o motorista.
     * Se falhar / sem API key, cai no fallback (legivel=false, confianca=0.3). */
    const expectedNF = (numeroNF as string | undefined) ?? viagem.numeroNF ?? null;
    const ocr = fotoUrl
      ? await extractDocumentDataWithTimeout(fotoUrl, 20000)
      : null;

    // Preenche os campos com o que a IA extraiu, respeitando o que já veio do cliente.
    if (ocr) {
      numeroNF            = numeroNF            ?? ocr.numeroNF ?? undefined;
      cnpjCliente         = cnpjCliente         ?? ocr.cnpj ?? undefined;
      valorDetectado      = valorDetectado      ?? ocr.valorTotal ?? undefined;
      assinaturaDetectada = typeof assinaturaDetectada === "boolean" ? assinaturaDetectada : ocr.assinaturaDetectada;
    }

    const iaConfidencia = ocr
      ? computeConfidence(ocr, expectedNF)
      : 0.3;
    const autoStatus = iaConfidencia > 0.85 ? "validado" : "pendente";

    req.log.info({
      nf: numeroNF, expectedNF, iaConfidencia,
      legivel: ocr?.legivel, assinatura: ocr?.assinaturaDetectada,
      tipoDoc: ocr?.tipoDocumento, autoStatus,
    }, "canhoto: resultado da análise IA");

    // Geofencing check
    let fraudAlert = false;
    let fraudDistanciaMetros: number | undefined;
    const endLat = (viagem as any).enderecoLat;
    const endLon = (viagem as any).enderecoLon;
    if (latitude && longitude && endLat && endLon) {
      const distancia = haversineMetros(latitude, longitude, endLat, endLon);
      fraudDistanciaMetros = Math.round(distancia);
      if (distancia > 500) {
        fraudAlert = true;
      }
    }

    const [created] = await db.insert(canhotosTable).values({
      viagemId,
      motoristaId: viagem.motoristaId,
      fotoUrl,
      latitude,
      longitude,
      timestamp: new Date(),
      numeroCte,
      cnpjCliente,
      numeroNF: numeroNF || viagem.numeroNF,
      valorDetectado: valorDetectado?.toString(),
      assinaturaDetectada: assinaturaDetectada ?? false,
      sealId,
      // Store client-side capture timestamp; fall back to server time if not provided
      capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
      status: fraudAlert ? "pendente" : autoStatus,
      iaConfidencia,
      fraudAlert,
      fraudDistanciaMetros,
    }).returning();

    await db.update(viagensTable)
      .set({ status: fraudAlert ? "entregue" : (autoStatus === "validado" ? "validado" : "entregue"), dataEntrega: new Date(), canhotoId: created.id })
      .where(eq(viagensTable.id, viagemId));

    res.json({ ...created, valorDetectado: created.valorDetectado ? parseFloat(created.valorDetectado as string) : null });
  } catch (err) {
    req.log.error({ err }, "Error submitting canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/canhotos", async (req, res) => {
  try {
    const transportadoraId = req.query.transportadoraId ? parseInt(req.query.transportadoraId as string) : undefined;
    const status = req.query.status as string | undefined;

    const viagens = await db.select().from(viagensTable);
    const clientes = await db.select().from(clientesTable);
    const motoristas = await db.select().from(motoristasTable);

    let rows = await db.select().from(canhotosTable);

    if (transportadoraId) {
      const viagemIds = viagens.filter(v => v.transportadoraId === transportadoraId).map(v => v.id);
      rows = rows.filter(c => viagemIds.includes(c.viagemId));
    }
    if (status) rows = rows.filter(c => c.status === status);

    const enriched = rows.map(c => {
      const viagem = viagens.find(v => v.id === c.viagemId);
      const cliente = viagem ? clientes.find(cl => cl.id === viagem.clienteId) : null;
      const motorista = c.motoristaId ? motoristas.find(m => m.id === c.motoristaId) : null;
      return {
        ...c,
        valorDetectado: c.valorDetectado ? parseFloat(c.valorDetectado as string) : null,
        clienteNome: cliente?.nome ?? null,
        clienteEmail: (viagem as any)?.emailFinanceiro ?? cliente?.emailFinanceiro ?? cliente?.email ?? null,
        clienteId: viagem?.clienteId ?? null,
        motoristaNome: motorista?.nome ?? null,
        valorFrete: viagem?.valorFrete ? parseFloat(viagem.valorFrete as string) : null,
        origem: viagem?.origem ?? null,
        destino: viagem?.destino ?? null,
      };
    });

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error listing canhotos");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/canhotos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(canhotosTable).where(eq(canhotosTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });

    const viagem = row.viagemId
      ? (await db.select().from(viagensTable).where(eq(viagensTable.id, row.viagemId)))[0]
      : null;
    const cliente = viagem?.clienteId
      ? (await db.select().from(clientesTable).where(eq(clientesTable.id, viagem.clienteId)))[0]
      : null;
    const motorista = row.motoristaId
      ? (await db.select().from(motoristasTable).where(eq(motoristasTable.id, row.motoristaId)))[0]
      : null;

    res.json({
      ...row,
      valorDetectado: row.valorDetectado ? parseFloat(row.valorDetectado as string) : null,
      clienteNome:    cliente?.nome ?? null,
      clienteEmail:   viagem ? (viagem as any).emailFinanceiro ?? cliente?.emailFinanceiro ?? null : null,
      motoristaNome:  motorista?.nome ?? null,
      motoristaTel:   motorista?.telefone ?? null,
      valorFrete:     viagem?.valorFrete ? parseFloat(viagem.valorFrete as string) : null,
      origem:         viagem?.origem ?? null,
      destino:        viagem?.destino ?? null,
      numeroNF:       row.numeroNF ?? viagem?.numeroNF ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/canhotos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { numeroNF, observacoes, cnpjCliente, valorDetectado } = req.body;
    const [updated] = await db.update(canhotosTable)
      .set({
        ...(numeroNF !== undefined && { numeroNF }),
        ...(observacoes !== undefined && { observacoes }),
        ...(cnpjCliente !== undefined && { cnpjCliente }),
        ...(valorDetectado !== undefined && { valorDetectado: String(valorDetectado) }),
      })
      .where(eq(canhotosTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, valorDetectado: updated.valorDetectado ? parseFloat(updated.valorDetectado as string) : null });
  } catch (err) {
    req.log.error({ err }, "Error updating canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/canhotos/:id/validate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, observacoes } = req.body;

    const [updated] = await db.update(canhotosTable)
      .set({ status, observacoes })
      .where(eq(canhotosTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    if (status === "validado") {
      await db.update(viagensTable).set({ status: "validado" }).where(eq(viagensTable.id, updated.viagemId));
    }

    res.json({ ...updated, valorDetectado: updated.valorDetectado ? parseFloat(updated.valorDetectado as string) : null });
  } catch (err) {
    req.log.error({ err }, "Error validating canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/canhotos/:id/approve", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [canhoto] = await db.select().from(canhotosTable).where(eq(canhotosTable.id, id));
    if (!canhoto) return res.status(404).json({ error: "Not found" });

    await db.update(canhotosTable).set({ status: "validado" }).where(eq(canhotosTable.id, id));
    await db.update(viagensTable).set({ status: "validado" }).where(eq(viagensTable.id, canhoto.viagemId));

    const [viagem] = await db.select().from(viagensTable).where(eq(viagensTable.id, canhoto.viagemId));
    let emailResult: { sent: boolean; preview: string } | null = null;

    if (viagem && viagem.clienteId) {
      /* ── Gera fatura se ainda não existe ───────────────────────── */
      const existing = await db.select().from(faturasTable).where(eq(faturasTable.canhotoId, id));
      if (existing.length === 0) {
        await db.insert(faturasTable).values({
          transportadoraId: viagem.transportadoraId,
          clienteId:        viagem.clienteId,
          viagemId:         viagem.id,
          canhotoId:        id,
          valor:            viagem.valorFrete ?? "0",
          status:           "pendente",
          dataEmissao:      new Date(),
          dataVencimento:   new Date(Date.now() + 30 * 24 * 3600000),
        });
      }

      /* ── Move viagem para arquivo (faturado) ──────────────────── */
      await db.update(viagensTable).set({ status: "faturado" }).where(eq(viagensTable.id, viagem.id));

      /* ── Atualiza XML vinculado para conciliado ─────────────────── */
      if (viagem.xmlId) {
        await db.update(xmlsTable).set({ status: "conciliado" }).where(eq(xmlsTable.id, viagem.xmlId));
      }

      /* ── Dispara E-mail Expresso de Cobrança (white-label por transportadora) ── */
      try {
        const [cliente] = await db.select().from(clientesTable).where(eq(clientesTable.id, viagem.clienteId));
        const [transportadora] = await db
          .select()
          .from(transportadorasTable)
          .where(eq(transportadorasTable.id, viagem.transportadoraId));

        if (cliente) {
          const emailTo = (viagem as any).emailFinanceiro ?? cliente.emailFinanceiro ?? cliente.email;
          // Nome exibido no remetente: prefere emailRemetente (nome comercial),
          // cai para o nome da transportadora se não estiver configurado.
          const transportadoraNome = transportadora?.emailRemetente?.trim()
            || transportadora?.nome
            || undefined;

          emailResult = await sendBillingEmail({
            to:                  emailTo,
            clienteNome:         cliente.nome,
            numeroNF:            canhoto.numeroNF ?? viagem.numeroNF ?? `VGM-${viagem.id}`,
            valorFrete:          parseFloat(viagem.valorFrete as string),
            destino:             viagem.destino ?? undefined,
            sealId:              canhoto.sealId ?? undefined,
            transportadoraNome,
          });
        }
      } catch (emailErr) {
        req.log.warn({ emailErr }, "approve: e-mail falhou — aprovação continua");
      }
    }

    res.json({
      success:  true,
      message:  "Canhoto aprovado, fatura gerada e e-mail de cobrança disparado.",
      emailEnviado: emailResult?.sent ?? false,
    });
  } catch (err) {
    req.log.error({ err }, "Error approving canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
