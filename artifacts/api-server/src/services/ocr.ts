import OpenAI from "openai";
import { logger } from "../lib/logger";

/* ── Cliente OpenAI via Replit AI Integrations ────────────────────────
 * NOTA: O cliente é criado lazy dentro da função para garantir que
 * as variáveis de ambiente estejam disponíveis no momento da execução.
 * ────────────────────────────────────────────────────────────────── */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  
  if (!apiKey) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY não configurada");
  }
  
  return new OpenAI({
    baseURL: baseURL ?? "https://api.openai.com/v1",
    apiKey: apiKey,
  });
}

export interface OcrResult {
  valorTotal:           number | null;
  cnpj:                 string | null;
  dataDocumento:        string | null;
  tipoDocumento:        "nota_fiscal" | "canhoto" | "comprovante" | "outro";
  descricao:            string;
  enderecoEntrega:      string | null;
  chaveAcesso:          string | null;
  numeroNF:             string | null;
  /* Foto legivel? false = borrada/escura/recortada. */
  legivel:              boolean;
  /* Ha assinatura/carimbo visivel no canhoto (prova de recebimento). */
  assinaturaDetectada:  boolean;
}

const PROMPT = `\
Você é um leitor especializado em documentos fiscais e logísticos brasileiros.
Analise a imagem e retorne APENAS um objeto JSON com estas chaves:

{
  "valorTotal":      <número decimal (ex: 1250.00) ou null>,
  "cnpj":            <"XX.XXX.XXX/XXXX-XX" formatado ou null>,
  "dataDocumento":   <"DD/MM/YYYY" ou null>,
  "tipoDocumento":   <"nota_fiscal" | "canhoto" | "comprovante" | "outro">,
  "descricao":       <string curta em português descrevendo o documento>,
  "enderecoEntrega": <endereço completo do destinatário (Rua, Nº, Bairro, Cidade - UF) ou null>,
  "chaveAcesso":     <chave de acesso de 44 dígitos da NF-e/CT-e ou null se não encontrado>,
  "numeroNF":        <número da nota fiscal ou CT-e, ex: "123456", ou null se não encontrado>,
  "legivel":             <true se o documento está nítido e legível; false se borrado, muito escuro, cortado ou não é um documento>,
  "assinaturaDetectada": <true se há assinatura manuscrita OU carimbo OU rubrica visível no canhoto (prova de recebimento); false caso contrário>
}

Regras:
- Procure "Valor Total", "Total a Pagar", "Valor do Frete", "VL Total" para valorTotal
- CNPJ: procure no emitente ou destinatário
- Para chaveAcesso: é uma sequência de 44 números sem espaços ou formatada com espaços
- Para enderecoEntrega: procure "Endereço", "Destinatário", "Local de Entrega", "Entregar em"
- Para assinaturaDetectada: procure qualquer rabisco, assinatura, carimbo, "RECEBI", nome escrito à mão na área de recebimento
- Para legivel: considere se um humano conseguiria ler os campos principais sem esforço
- Retorne SOMENTE o JSON, sem markdown, sem explicação, sem código fence`;

export async function extractDocumentData(dataUrl: string): Promise<OcrResult> {
  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text: PROMPT,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";

    const json = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const data = JSON.parse(json) as Partial<OcrResult>;

    return {
      valorTotal:          typeof data.valorTotal === "number" ? data.valorTotal : null,
      cnpj:                typeof data.cnpj === "string" && data.cnpj !== "null" ? data.cnpj : null,
      dataDocumento:       typeof data.dataDocumento === "string" && data.dataDocumento !== "null" ? data.dataDocumento : null,
      tipoDocumento:       (["nota_fiscal", "canhoto", "comprovante", "outro"] as const).includes(data.tipoDocumento as any)
        ? data.tipoDocumento as OcrResult["tipoDocumento"]
        : "comprovante",
      descricao:           typeof data.descricao === "string" ? data.descricao : "Comprovante enviado",
      enderecoEntrega:     typeof data.enderecoEntrega === "string" && data.enderecoEntrega !== "null" ? data.enderecoEntrega : null,
      chaveAcesso:         typeof data.chaveAcesso === "string" && data.chaveAcesso !== "null" && /\d{44}/.test(data.chaveAcesso.replace(/\s/g,"")) ? data.chaveAcesso.replace(/\s/g,"") : null,
      numeroNF:            typeof data.numeroNF === "string" && data.numeroNF !== "null" ? data.numeroNF : null,
      legivel:             typeof data.legivel === "boolean" ? data.legivel : true,
      assinaturaDetectada: typeof data.assinaturaDetectada === "boolean" ? data.assinaturaDetectada : false,
    };
  } catch (err) {
    logger.warn({ err }, "ocr: falha na extração — usando valores padrão");
    return {
      valorTotal: null, cnpj: null, dataDocumento: null,
      tipoDocumento: "comprovante",
      descricao: "Comprovante (falha na leitura automática)",
      enderecoEntrega: null, chaveAcesso: null, numeroNF: null,
      legivel: false, assinaturaDetectada: false,
    };
  }
}

/* Normaliza NF/CT-e para comparação (remove zeros à esquerda e não-dígitos). */
function normalizeDocNumber(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "").replace(/^0+/, "");
}

/* Calcula a confianca (0..1) a partir do resultado do OCR e dos dados
 * esperados da viagem. Pesos escolhidos para que:
 * - Foto ilegivel OU NF errada => score baixo (<0.85) => cai na fila humana
 * - Foto boa + NF certa + assinatura => score alto (>=0.85) => auto-aprova */
export function computeConfidence(ocr: OcrResult, expectedNF: string | null): number {
  if (!ocr.legivel) return 0.3;

  let score = 0.25; // base por ter conseguido ler algo
  if (ocr.assinaturaDetectada) score += 0.30;
  if (ocr.numeroNF)            score += 0.15;
  if (ocr.cnpj)                score += 0.10;
  if (ocr.valorTotal)          score += 0.05;
  if (ocr.tipoDocumento === "canhoto" || ocr.tipoDocumento === "nota_fiscal") score += 0.05;

  // Match da NF extraida com a NF esperada (peso alto — evita canhoto trocado)
  if (expectedNF && ocr.numeroNF) {
    const a = normalizeDocNumber(ocr.numeroNF);
    const b = normalizeDocNumber(expectedNF);
    if (a && b && a === b) score += 0.20;
    else                   score -= 0.25; // penaliza NF divergente
  }

  return Math.max(0, Math.min(1, score));
}

/* Promise com timeout — impede que o envio do motorista trave esperando a IA. */
export async function extractDocumentDataWithTimeout(
  dataUrl: string,
  timeoutMs = 20000,
): Promise<OcrResult> {
  return Promise.race([
    extractDocumentData(dataUrl),
    new Promise<OcrResult>((resolve) => setTimeout(() => {
      logger.warn({ timeoutMs }, "ocr: timeout — caindo em fallback");
      resolve({
        valorTotal: null, cnpj: null, dataDocumento: null,
        tipoDocumento: "comprovante",
        descricao: "Aguardando análise (timeout da IA)",
        enderecoEntrega: null, chaveAcesso: null, numeroNF: null,
        legivel: false, assinaturaDetectada: false,
      });
    }, timeoutMs)),
  ]);
}
