import { Router, type IRouter } from "express";
import { db, xmlsTable, canhotosTable, viagensTable, motoristasTable, clientesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractDocumentData } from "../services/ocr";
import { resolveTenantId, requireTenantId, TenantScopeError } from "../lib/tenant-scope";

const router: IRouter = Router();

router.get("/xmls", async (req, res) => {
  try {
    const transportadoraId = resolveTenantId(req);
    const rows = typeof transportadoraId === "number"
      ? await db.select().from(xmlsTable).where(eq(xmlsTable.transportadoraId, transportadoraId))
      : await db.select().from(xmlsTable);
    res.json(rows.map(x => ({ ...x, valorFrete: x.valorFrete ? parseFloat(x.valorFrete as string) : null })));
  } catch (err) {
    req.log.error({ err }, "Error listing xmls");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/xmls", async (req, res) => {
  try {
    let transportadoraId: number;
    try { transportadoraId = requireTenantId(req); }
    catch (e) { if (e instanceof TenantScopeError) return res.status(400).json({ error: e.message }); throw e; }
    const { tipo, xmlContent, numeroCte, cnpjEmissor, cnpjDestinatario, nomeDestinatario, valorFrete, dataEmissao } = req.body;

    const [created] = await db.insert(xmlsTable).values({
      transportadoraId,
      tipo,
      xmlContent,
      numeroCte,
      cnpjEmissor,
      cnpjDestinatario,
      nomeDestinatario,
      valorFrete: valorFrete?.toString(),
      dataEmissao: dataEmissao ? new Date(dataEmissao) : undefined,
      status: "pendente",
    }).returning();

    res.status(201).json({ ...created, valorFrete: created.valorFrete ? parseFloat(created.valorFrete as string) : null });
  } catch (err) {
    req.log.error({ err }, "Error uploading xml");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── OCR: extrai dados de imagem ou PDF via IA e salva no banco ──── */
router.post("/xmls/ocr", async (req, res) => {
  try {
    let transportadoraId: number;
    try { transportadoraId = requireTenantId(req); }
    catch (e) { if (e instanceof TenantScopeError) return res.status(400).json({ error: e.message }); throw e; }
    const { dataUrl, fileName } = req.body as {
      dataUrl: string;
      fileName: string;
    };

    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return res.status(400).json({ error: "dataUrl inválida" });
    }

    req.log.info({ fileName }, "ocr: iniciando — criando registro imediato");

    /* ── PASSO 1: Cria o registro XML IMEDIATAMENTE (antes do OCR) ── */
    const placeholderNumeroCte = fileName.replace(/\.(jpg|jpeg|png|pdf)$/i, "").slice(0, 60);

    const [created] = await db.insert(xmlsTable).values({
      transportadoraId,
      tipo:             "comprovante",
      numeroCte:        placeholderNumeroCte,
      nomeDestinatario: "Processando...",
      valorFrete:       "0",
      xmlContent:       dataUrl.slice(0, 80_000),
      status:           "pendente",
    }).returning();

    /* ── PASSO 2: Cria Viagem IMEDIATAMENTE (antes do OCR) ──────── 
     * IMPORTANTE: NÃO assumir cliente padrão. Deixar clienteId null para
     * que seja atribuído após o OCR (com base no CNPJ extraído) ou
     * manualmente pelo admin na fila de conferência. Isso evita o bug
     * onde todos os fretes iam para o primeiro cliente cadastrado.
     * ───────────────────────────────────────────────────────────────── */
    const [defaultMotorista] = await db.select().from(motoristasTable)
      .where(eq(motoristasTable.transportadoraId, transportadoraId)).limit(1);

    const [viagem] = await db.insert(viagensTable).values({
      transportadoraId,
      motoristaId:  defaultMotorista?.id ?? null,
      clienteId:    null, // Preenchido depois via OCR ou manualmente
      numeroNF:     placeholderNumeroCte,
      valorFrete:   "0",
      status:       "pendente",
      xmlId:        created.id,
    }).returning();

    await db.update(xmlsTable)
      .set({ viagemId: viagem.id })
      .where(eq(xmlsTable.id, created.id));

    req.log.info({ xmlId: created.id, viagemId: viagem.id }, "ocr: registro criado — iniciando extração IA");

    /* ── PASSO 3: Executa OCR e atualiza o registro com os dados ── */
    let ocr: Awaited<ReturnType<typeof extractDocumentData>> | null = null;
    let ocrErro = false;

    try {
      ocr = await extractDocumentData(dataUrl);
      req.log.info({ fileName, tipoDocumento: ocr.tipoDocumento, valorTotal: ocr.valorTotal }, "ocr: extração concluída");

      let dataEmissao: Date | undefined;
      if (ocr.dataDocumento) {
        const [d, m, y] = ocr.dataDocumento.split("/");
        const parsed = new Date(`${y}-${m}-${d}`);
        if (!isNaN(parsed.getTime())) dataEmissao = parsed;
      }

      const numeroCteOcr = ocr.numeroNF
        ? ocr.numeroNF
        : [ocr.tipoDocumento.toUpperCase().replace("_", " "), placeholderNumeroCte].join(" — ");

      /* Busca cliente pelo CNPJ extraído. Se não encontrar, cria automaticamente
       * com os dados do OCR — admin pode completar dados depois na tela de clientes. */
      let clienteOcr: { id: number } | null = null;
      if (ocr.cnpj) {
        const [porCnpj] = await db.select().from(clientesTable).where(eq(clientesTable.cnpj, ocr.cnpj)).limit(1);
        if (porCnpj) {
          clienteOcr = porCnpj;
        } else {
          try {
            const [novoCliente] = await db.insert(clientesTable).values({
              transportadoraId,
              nome:   ocr.descricao || `Cliente ${ocr.cnpj}`,
              cnpj:   ocr.cnpj,
              email:  `pendente+${Date.now()}@preencher.com`, // placeholder — admin deve atualizar
              endereco: ocr.enderecoEntrega ?? null,
            }).returning();
            clienteOcr = novoCliente;
            req.log.info({ clienteId: novoCliente.id, cnpj: ocr.cnpj }, "ocr: cliente criado automaticamente");
          } catch (clienteErr) {
            req.log.warn({ clienteErr, cnpj: ocr.cnpj }, "ocr: falha ao criar cliente — viagem ficará sem cliente");
          }
        }
      }

      await db.update(xmlsTable).set({
        numeroCte:        numeroCteOcr,
        cnpjDestinatario: ocr.cnpj ?? null,
        cnpjEmissor:      ocr.cnpj ?? null,
        nomeDestinatario: ocr.descricao || "Nota Fiscal",
        valorFrete:       ocr.valorTotal?.toString() ?? "0",
        dataEmissao,
        enderecoEntrega:  ocr.enderecoEntrega ?? null,
        chaveAcesso:      ocr.chaveAcesso ?? null,
        status:           "processando", // Mudança: processando em vez de pendente
      }).where(eq(xmlsTable.id, created.id));

      await db.update(viagensTable).set({
        clienteId:  clienteOcr?.id ?? viagem.clienteId,
        numeroNF:   numeroCteOcr,
        valorFrete: ocr.valorTotal?.toString() ?? "0",
        destino:    ocr.enderecoEntrega ?? null,
      }).where(eq(viagensTable.id, viagem.id));

    } catch (ocrErr) {
      ocrErro = true;
      req.log.warn({ ocrErr, xmlId: created.id }, "ocr: extração falhou — registro mantido com status 'Pendente de Dados'");
      await db.update(xmlsTable).set({
        nomeDestinatario: "Pendente de Dados",
        status:           "pendente",
      }).where(eq(xmlsTable.id, created.id));
      await db.update(viagensTable).set({
        numeroNF: `UPLOAD-${created.id}`,
      }).where(eq(viagensTable.id, viagem.id));
    }

    const [xmlFinal] = await db.select().from(xmlsTable).where(eq(xmlsTable.id, created.id));
    const [viagemFinal] = await db.select().from(viagensTable).where(eq(viagensTable.id, viagem.id));

    return res.status(201).json({
      ...xmlFinal,
      valorFrete: xmlFinal.valorFrete ? parseFloat(xmlFinal.valorFrete as string) : 0,
      ocr: ocr ?? null,
      ocrErro,
      viagem: { ...viagemFinal, valorFrete: parseFloat(viagemFinal.valorFrete as string) },
    });
  } catch (err) {
    req.log.error({ err }, "ocr: erro fatal ao processar documento");
    return res.status(500).json({ error: "Erro ao processar documento com OCR" });
  }
});

/* ── Edição manual de dados na fila de conferência ──
 * Usado quando OCR falha ou extrai dados parciais. Admin
 * pode ajustar valor, CNPJ, cliente vinculado etc. ──── */
router.patch("/xmls/:id", async (req, res) => {
  try {
    const xmlId = parseInt(req.params.id);
    if (Number.isNaN(xmlId)) return res.status(400).json({ error: "id inválido" });

    const {
      numeroCte,
      cnpjDestinatario,
      cnpjEmissor,
      nomeDestinatario,
      valorFrete,
      dataEmissao,
      enderecoEntrega,
      chaveAcesso,
      clienteId,
      status,
    } = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (typeof numeroCte === "string")        updates.numeroCte = numeroCte;
    if (typeof cnpjDestinatario === "string") updates.cnpjDestinatario = cnpjDestinatario;
    if (typeof cnpjEmissor === "string")      updates.cnpjEmissor = cnpjEmissor;
    if (typeof nomeDestinatario === "string") updates.nomeDestinatario = nomeDestinatario;
    if (valorFrete !== undefined && valorFrete !== null) updates.valorFrete = String(valorFrete);
    if (typeof dataEmissao === "string")      updates.dataEmissao = new Date(dataEmissao);
    if (typeof enderecoEntrega === "string")  updates.enderecoEntrega = enderecoEntrega;
    if (typeof chaveAcesso === "string")      updates.chaveAcesso = chaveAcesso;
    if (typeof status === "string")           updates.status = status;

    const [updated] = await db.update(xmlsTable)
      .set(updates)
      .where(eq(xmlsTable.id, xmlId))
      .returning();

    if (!updated) return res.status(404).json({ error: "XML não encontrado" });

    /* Propaga alterações relevantes para a viagem associada */
    if (updated.viagemId) {
      const viagemUpdates: Record<string, unknown> = {};
      if (updates.numeroCte)   viagemUpdates.numeroNF = updates.numeroCte;
      if (updates.valorFrete)  viagemUpdates.valorFrete = updates.valorFrete;
      if (updates.enderecoEntrega) viagemUpdates.destino = updates.enderecoEntrega;
      if (typeof clienteId === "number") viagemUpdates.clienteId = clienteId;

      if (Object.keys(viagemUpdates).length > 0) {
        await db.update(viagensTable)
          .set(viagemUpdates)
          .where(eq(viagensTable.id, updated.viagemId));
      }
    }

    res.json({
      ...updated,
      valorFrete: updated.valorFrete ? parseFloat(updated.valorFrete as string) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating xml");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/xmls/:id/match", async (req, res) => {
  try {
    const xmlId = parseInt(req.params.id);
    const [xml] = await db.select().from(xmlsTable).where(eq(xmlsTable.id, xmlId));
    if (!xml) return res.status(404).json({ error: "XML not found" });

    const canhotos = await db.select().from(canhotosTable);
    const matchedCanhoto = canhotos.find(c =>
      (xml.numeroCte && c.numeroCte === xml.numeroCte) ||
      (xml.cnpjDestinatario && c.cnpjCliente === xml.cnpjDestinatario)
    );

    if (matchedCanhoto) {
      await db.update(xmlsTable)
        .set({ status: "conciliado", canhotoId: matchedCanhoto.id, viagemId: matchedCanhoto.viagemId })
        .where(eq(xmlsTable.id, xmlId));

      await db.update(viagensTable)
        .set({ xmlId, status: "validado" })
        .where(eq(viagensTable.id, matchedCanhoto.viagemId));

      return res.json({
        matched: true,
        xmlId,
        canhotoId: matchedCanhoto.id,
        viagemId: matchedCanhoto.viagemId,
        confidence: 0.97,
        details: `CT-e ${xml.numeroCte} conciliado com canhoto #${matchedCanhoto.id}`,
        status: "conciliado",
      });
    }

    res.json({
      matched: false,
      xmlId,
      confidence: 0,
      details: "Nenhum canhoto correspondente encontrado",
      status: "pendente",
    });
  } catch (err) {
    req.log.error({ err }, "Error matching xml to canhoto");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Exclusão de documento XML ──
 * Permite excluir um documento XML com motivo obrigatório.
 * Também remove a viagem associada se existir. ──── */
router.delete("/xmls/:id", async (req, res) => {
  try {
    const xmlId = parseInt(req.params.id);
    if (Number.isNaN(xmlId)) return res.status(400).json({ error: "id inválido" });

    const { motivo } = req.query;
    if (!motivo || typeof motivo !== "string") {
      return res.status(400).json({ error: "motivo da exclusão é obrigatório" });
    }

    const [xml] = await db.select().from(xmlsTable).where(eq(xmlsTable.id, xmlId));
    if (!xml) return res.status(404).json({ error: "XML não encontrado" });

    // Verifica se pertence à transportadora correta
    const transportadoraId = resolveTenantId(req);
    if (typeof transportadoraId === "number" && xml.transportadoraId !== transportadoraId) {
      return res.status(403).json({ error: "Sem permissão para excluir este documento" });
    }

    // Remove a viagem associada se existir
    if (xml.viagemId) {
      await db.delete(viagensTable).where(eq(viagensTable.id, xml.viagemId));
      req.log.info({ viagemId: xml.viagemId, motivo }, "viagem associada excluída");
    }

    // Remove o XML
    await db.delete(xmlsTable).where(eq(xmlsTable.id, xmlId));
    req.log.info({ xmlId, motivo }, "XML excluído");

    res.json({ success: true, xmlId, motivo });
  } catch (err) {
    req.log.error({ err }, "Error deleting xml");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
