import { Router, type IRouter } from "express";
import { db, xmlsTable, canhotosTable, viagensTable, motoristasTable, clientesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractDocumentData } from "../services/ocr";

const router: IRouter = Router();

router.get("/xmls", async (req, res) => {
  try {
    const transportadoraId = req.query.transportadoraId ? parseInt(req.query.transportadoraId as string) : undefined;
    const rows = transportadoraId
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
    const { transportadoraId, tipo, xmlContent, numeroCte, cnpjEmissor, cnpjDestinatario, nomeDestinatario, valorFrete, dataEmissao } = req.body;

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
    const { dataUrl, fileName, transportadoraId = 1 } = req.body as {
      dataUrl: string;
      fileName: string;
      transportadoraId?: number;
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

    /* ── PASSO 2: Cria Viagem IMEDIATAMENTE (antes do OCR) ──────── */
    const [defaultMotorista] = await db.select().from(motoristasTable)
      .where(eq(motoristasTable.transportadoraId, transportadoraId)).limit(1);
    const [defaultCliente] = await db.select().from(clientesTable)
      .where(eq(clientesTable.transportadoraId, transportadoraId)).limit(1);

    const [viagem] = await db.insert(viagensTable).values({
      transportadoraId,
      motoristaId:  defaultMotorista?.id ?? null,
      clienteId:    defaultCliente?.id ?? null,
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

      /* Busca cliente pelo CNPJ extraído se disponível */
      let clienteOcr = defaultCliente;
      if (ocr.cnpj) {
        const [porCnpj] = await db.select().from(clientesTable).where(eq(clientesTable.cnpj, ocr.cnpj)).limit(1);
        if (porCnpj) clienteOcr = porCnpj;
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
        status:           "pendente",
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

export default router;
